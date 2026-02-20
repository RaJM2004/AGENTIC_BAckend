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


export default router;
