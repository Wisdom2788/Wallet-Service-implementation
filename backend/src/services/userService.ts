import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../config/database';
import { ConflictError, AuthenticationError, NotFoundError } from '../errors/AppError';
import { User, Wallet } from '../types';
import { generateToken } from '../middleware/auth';
import { CreateUserInput, LoginInput } from '../validators/schemas';

const BCRYPT_SALT_ROUNDS = 12;

export interface UserWithWallet {
  user: Omit<User, 'password_hash'>;
  wallet: Wallet;
  token: string;
}

export async function createUser(input: CreateUserInput): Promise<UserWithWallet> {

  const existing = await queryOne<User>(
    'SELECT id FROM users WHERE email = $1',
    [input.email]
  );
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  return withTransaction(async (client) => {

    const userResult = await client.query<User>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [input.name, input.email, passwordHash]
    );
    const user = userResult.rows[0];


    const walletResult = await client.query<Wallet>(
      `INSERT INTO wallets (user_id) VALUES ($1) RETURNING *`,
      [user.id]
    );
    const wallet = walletResult.rows[0];

    const token = generateToken({
      userId: user.id,
      email: user.email,
      walletId: wallet.id,
    });

    return { user, wallet, token };
  });
}


export async function loginUser(
  input: LoginInput
): Promise<UserWithWallet & { user: User }> {
  const user = await queryOne<User & { password_hash: string }>(
    `SELECT u.id, u.name, u.email, u.password_hash, u.created_at
     FROM users u WHERE u.email = $1`,
    [input.email]
  );

  const INVALID_CREDENTIALS = 'Invalid email or password';

  if (!user) throw new AuthenticationError(INVALID_CREDENTIALS);

  const passwordValid = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordValid) throw new AuthenticationError(INVALID_CREDENTIALS);

  const wallet = await queryOne<Wallet>(
    'SELECT * FROM wallets WHERE user_id = $1',
    [user.id]
  );
  if (!wallet) throw new NotFoundError('Wallet');

  const token = generateToken({
    userId: user.id,
    email: user.email,
    walletId: wallet.id,
  });

  const { password_hash, ...userWithoutHash } = user;

  return { user: userWithoutHash as User, wallet, token };
}


export async function getUserById(userId: string): Promise<User> {
  const user = await queryOne<User>(
    `SELECT id, name, email, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new NotFoundError('User');
  return user;
}

export async function listUsers(excludeUserId: string): Promise<User[]> {
  return query<User>(
    `SELECT id, name, email, created_at FROM users WHERE id != $1 ORDER BY name ASC`,
    [excludeUserId]
  );
}
