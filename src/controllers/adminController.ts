import { Request, Response } from 'express';
import { User } from '../models/User';
import { Workflow } from '../models/Workflow';
import { Execution } from '../models/Execution';

export const getAdminStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const totalUsers = await User.countDocuments();
        const totalWorkflows = await Workflow.countDocuments();
        const totalExecutions = await Execution.countDocuments();

        // Get recent users
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('-password');

        // Get node usage stats
        const workflows = await Workflow.find().select('nodes');
        const nodeTypeCounts: Record<string, number> = {};

        workflows.forEach(w => {
            w.nodes.forEach((node: any) => {
                const type = node.data?.type || node.type || 'unknown';
                nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;
            });
        });

        const popularNodes = Object.entries(nodeTypeCounts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Get daily executions for a chart
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyExecutions = await Execution.aggregate([
            { $match: { startedAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        res.json({
            stats: {
                totalUsers,
                totalWorkflows,
                totalExecutions,
            },
            recentUsers,
            popularNodes,
            dailyExecutions
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
