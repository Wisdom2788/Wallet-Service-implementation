import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import walletRoutes from './routes/wallet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;


app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: true,
  })
);

// Rate limiting — applied globally. For financial operations you'd want
// stricter per-route limits (e.g., 10 transfers/min per user).
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000'), // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  },
});
app.use(limiter);


app.use(express.json({ limit: '10kb' })); // Reject suspiciously large payloads
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/wallet', walletRoutes);


app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(` Wallet service running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

export default app;
