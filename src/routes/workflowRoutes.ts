import express from 'express';
import { createWorkflow, getWorkflows, getWorkflowById, saveWorkflow, runWorkflowController, shareWorkflow, getExecutions, getExecutionById, getDashboardStats } from '../controllers/workflowController';
import { generateWorkflow } from '../controllers/workflowGeneratorController';
import { createCredential, getCredentials, deleteCredential } from '../controllers/credentialController';
import { Workflow } from '../models/Workflow';
import { runWorkflow } from '../services/executionEngine';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Webhook Trigger (Public)
router.post('/webhook/:workflowId', async (req, res) => {
    try {
        const { workflowId } = req.params;
        const wf = await Workflow.findById(workflowId);
        if (!wf) return res.status(404).json({ error: 'Workflow not found' });
        runWorkflow(wf, 'webhook', req.body, wf.createdBy);
        res.json({ message: "Webhook received, workflow started", data: req.body });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.use(authMiddleware);

// Workflows
router.post('/workflows', createWorkflow);
router.get('/workflows', getWorkflows);
router.get('/workflows/:id', getWorkflowById);
router.put('/workflows/:id', saveWorkflow);
router.post('/workflows/:id/run', runWorkflowController);
router.post('/workflows/:id/share', shareWorkflow);
router.get('/stats', getDashboardStats);
router.post('/ai/generate-workflow', generateWorkflow);

// Executions
router.get('/executions/:workflowId', getExecutions);
router.get('/execution-details/:id', getExecutionById);

// Credentials
router.post('/credentials', createCredential);
router.get('/credentials', getCredentials);
router.delete('/credentials/:id', deleteCredential);

// File Uploads
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

router.post('/upload', upload.single('file'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
        message: 'File uploaded successfully',
        fileName: req.file.originalname,
        filePath: req.file.path.replace(/\\/g, '/') // Ensure forward slashes for cross-platform
    });
});

export default router;
