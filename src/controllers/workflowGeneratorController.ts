import { Request, Response } from 'express';
import Groq from 'groq-sdk';
import { Credential } from '../models/Credential';

const SYSTEM_PROMPT = `
You are an expert workflow designer for an automation platform.
Your task is to take a user's natural language request and convert it into a valid workflow JSON structure.
The workflow consists of 'nodes' and 'edges'.

### Node Types available:
- 'manualTrigger': Starting point. No config needed.
- 'aiModel': Config: { prompt, model, temperature }. Use for NLP tasks.
- 'gmail': Config: { to, subject, body, user, pass }. Use for emails.
- 'whatsapp': Config: { to, message }. Use for messaging.
- 'excel': Config: { operation: 'read'|'write', filePath }. Use for spreadsheets.
- 'httpRequest': Config: { url, method, body, headers }. Use for API calls.
- 'code': Config: { code }. Use for data manipulation.

### JSON Format:
{
  "nodes": [
    { 
      "id": "1", 
      "type": "manualTrigger", 
      "data": { "label": "Start", "type": "manualTrigger" }, 
      "position": { "x": 100, "y": 100 } 
    },
    ...
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2", "animated": true },
    ...
  ]
}

### Rules:
1. ALWAYS start with a 'manualTrigger' node (id: '1').
2. Ensure logical flow between nodes.
3. Use placeholder values for configuration like 'REPLACE_WITH_URL', 'REPLACE_WITH_EMAIL', etc.
4. ONLY return the JSON object. Do not include any markdown or explanatory text.
5. Provide a diverse range of nodes if the user request is broad.
6. Position nodes logically: increment Y by 150 for each step.
`;

export const generateWorkflow = async (req: Request, res: Response): Promise<void> => {
    try {
        const { prompt } = req.body;
        const userId = (req as any).user?.userId || 'system';

        // Get Groq client
        const cred = await Credential.findOne({ service: 'groq', userId });
        const apiKey = cred ? cred.value : process.env.GROQ_API_KEY;

        if (!apiKey) {
            res.status(400).json({ message: "Groq API Key not found. Please add it in Settings > Credentials." });
            return;
        }

        const groq = new Groq({ apiKey });

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            model: 'mixtral-8x7b-32768',
            temperature: 0.1, // Low temperature for consistent JSON
            response_format: { type: 'json_object' }
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            res.status(500).json({ message: "Failed to generate workflow" });
            return;
        }

        const workflow = JSON.parse(content);
        res.json(workflow);
    } catch (error) {
        console.error('Workflow generation error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
