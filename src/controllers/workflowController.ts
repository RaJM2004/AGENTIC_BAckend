import { Request, Response } from 'express';
import { Workflow } from '../models/Workflow';
import { Execution } from '../models/Execution';
import { runWorkflow } from '../services/executionEngine';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';

export const createWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const workflow = new Workflow({
            ...req.body,
            createdBy: req.user?.userId
        });
        await workflow.save();
        res.status(201).json(workflow);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getWorkflows = async (req: AuthRequest, res: Response) => {
    try {
        const workflows = await Workflow.find({ createdBy: req.user?.userId }).sort({ createdAt: -1 });
        res.json(workflows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getWorkflowById = async (req: AuthRequest, res: Response) => {
    try {
        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
        res.json(workflow);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const saveWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const workflow = await Workflow.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(workflow);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const runWorkflowController = async (req: AuthRequest, res: Response) => {
    try {
        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

        // Use provided initialData or empty object
        const execution = await runWorkflow(workflow, 'manual', req.body, req.user?.userId);
        res.json({ executionId: execution._id, status: 'started' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const shareWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const workflow = await Workflow.findById(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

        // In a real app, generate a unique token. For MVP, we just assume public ID access or a flag.
        // Let's just return a shareable URL structure. 
        const shareUrl = `${req.protocol}://${req.get('host')}/app?workflowId=${workflow._id}&mode=read`;
        res.json({ url: shareUrl });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getExecutions = async (req: AuthRequest, res: Response) => {
    try {
        const executions = await Execution.find({ workflowId: req.params.workflowId }).sort({ startedAt: -1 });
        res.json(executions);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getExecutionById = async (req: AuthRequest, res: Response) => {
    try {
        const execution = await Execution.findById(req.params.id);
        res.json(execution);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const [workflowCount, executionCount, userCount] = await Promise.all([
            Workflow.countDocuments({ createdBy: userId }),
            Execution.countDocuments({
                workflowId: { $in: await Workflow.find({ createdBy: userId }).distinct('_id') }
            }),
            User.countDocuments()
        ]);

        const stats = {
            totalProjects: workflowCount,
            totalFlows: workflowCount,
            totalUsers: userCount,
            totalStorage: "0.00 KB",
            deployedFlows: executionCount,
            deployedComponents: workflowCount * 3,
            totalTickets: 2,
            pendingTickets: 1,
            resolvedTickets: 1,
            closedTickets: 0
        };

        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
