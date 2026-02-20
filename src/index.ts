import 'dotenv/config'; // Load env vars before anything else
import express from 'express';
import cors from 'cors';
import { connectDB } from './utils/db';
import workflowRoutes from './routes/workflowRoutes';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', workflowRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
    res.send('Workflow Automation Platform API Running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
