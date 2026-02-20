
import { Request, Response } from 'express';
import { Credential } from '../models/Credential';
import { AuthRequest } from '../middleware/auth';

export const createCredential = async (req: AuthRequest, res: Response) => {
    try {
        const { service, name, value } = req.body;
        const userId = req.user?.userId;

        // Simple check if exists for this user
        const existing = await Credential.findOne({ service, name, userId });
        if (existing) {
            existing.value = value;
            await existing.save();
            return res.json(existing);
        }
        const cred = new Credential({ service, name, value, userId });
        await cred.save();
        res.status(201).json(cred);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
};

export const getCredentials = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const creds = await Credential.find({ userId }, { value: 0 }); // Hide value
        res.json(creds);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteCredential = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const cred = await Credential.findOne({ _id: req.params.id, userId });
        if (!cred) {
            return res.status(404).json({ error: 'Credential not found or unauthorized' });
        }
        await Credential.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}
