
import axios from 'axios';
import Groq from 'groq-sdk';
import vm from 'vm';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { Credential } from '../models/Credential';


// Enhanced helper to resolve variables like {{input.name}} AND {{nodeId.field}} AND {{nodeId[0].field}}
const resolveVariables = (template: string, context: any, nodeOutputs: Record<string, any> = {}) => {
    if (!template) return "";

    let resolved = template;

    console.log('    🔍 Resolving template:', template);
    console.log('    Available nodes:', Object.keys(nodeOutputs));

    // Enhanced regex: {{nodeId[index].field}} or {{nodeId.field}} or {{nodeId}}
    resolved = resolved.replace(/\{\{([a-zA-Z0-9_-]+)(\[\d+\])?(\.([a-zA-Z0-9_.\[\]]+))?\}\}/g, (match, nodeId, arrayIndex, dotField, field) => {
        console.log(`    Match: nodeId="${nodeId}", arrayIndex="${arrayIndex || 'none'}", field="${field || 'none'}"`);

        // 🔧 FIX: Check 'input' FIRST (it's a special reserved keyword, not a node)
        if (nodeId === 'input' && context) {
            console.log(`    📥 Special keyword "input" detected - using current context`);
            let value = context;
            if (arrayIndex) {
                const idx = parseInt(arrayIndex.replace(/\[|\]/g, ''));
                if (Array.isArray(value)) {
                    value = value[idx];
                    console.log(`    Got input[${idx}]:`, JSON.stringify(value).substring(0, 100));
                }
            }
            if (field) {
                const originalValue = value;
                value = getNestedValue(value, field);
                if (value === undefined) {
                    console.log(`    ❌ ERROR: Field .${field} not found in input context`);
                    console.log(`    Available fields in input:`, typeof originalValue === 'object' ? Object.keys(originalValue) : 'N/A');
                } else {
                    console.log(`    Got input.${field}:`, value);
                }
            }
            if (value !== undefined) {
                const preview = String(value).substring(0, 100);
                console.log(`    ✅ Resolved from input: "${preview}${String(value).length > 100 ? '...' : ''}"`);
                return String(value);
            }
            console.log(`    ❌ Could not resolve from input context`);
            return match;
        }

        // Auto-fix for common mistake: using .response on aiModel (which returns string)
        if (field === 'response' && nodeId.startsWith('aiModel')) {
            console.log(`    ⚠️ NOTE: accessing .response on aiModel - auto-correcting to direct value`);
            // We consciously ignore the 'field' here and just return the direct value later
            field = undefined;
        }

        // Check if this is referencing a specific node output
        if (nodeOutputs[nodeId]) {
            console.log(`    Found "${nodeId}" (${Array.isArray(nodeOutputs[nodeId]) ? `array(${nodeOutputs[nodeId].length})` : typeof nodeOutputs[nodeId]})`);
            let value = nodeOutputs[nodeId];

            // Apply array index [0] if present
            if (arrayIndex) {
                const idx = parseInt(arrayIndex.replace(/\[|\]/g, ''));
                if (Array.isArray(value) && idx < value.length) {
                    value = value[idx];
                    console.log(`    Got [${idx}]:`, JSON.stringify(value).substring(0, 100));
                } else {
                    console.log(`    ❌ ERROR: Can't access [${idx}] (array length: ${Array.isArray(value) ? value.length : 'not an array'})`);
                    return match;
                }
            }

            // Apply field path if present
            if (field) {
                const originalValue = value;
                value = getNestedValue(value, field);
                if (value === undefined) {
                    console.log(`    ❌ ERROR: Field .${field} not found in value`);
                    console.log(`    Available fields:`, typeof originalValue === 'object' ? Object.keys(originalValue) : 'N/A (value is not an object)');
                }
                console.log(`    Got .${field}:`, value);
            }

            if (value !== undefined) {
                const preview = String(value).substring(0, 100);
                console.log(`    ✅ Resolved to: "${preview}${String(value).length > 100 ? '...' : ''}"`);
                return String(value);
            }
        } else {
            console.log(`    ❌ ERROR: Node "${nodeId}" not found in available outputs`);
            console.log(`    Did you mean one of these? ${Object.keys(nodeOutputs).join(', ') || '(none available)'}`);
        }

        console.log(`    ❌ Not resolved - placeholder will remain in output`);
        return match;
    });

    // Check if there are still unresolved placeholders and warn
    const unresolvedMatches = resolved.match(/\{\{[^}]+\}\}/g);
    if (unresolvedMatches && unresolvedMatches.length > 0) {
        console.log(`    ⚠️⚠️⚠️ WARNING: ${unresolvedMatches.length} placeholder(s) could not be resolved:`);
        unresolvedMatches.forEach(placeholder => console.log(`      - ${placeholder}`));
    }

    return resolved;
};

// Helper to get nested values like "rows[0].Email" or "data.user.name"
const getNestedValue = (obj: any, path: string): any => {
    if (!obj) return undefined;

    // Handle array indexing: rows[0].Email
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
        if (current === undefined || current === null) return undefined;

        // Check for array access: field[index]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, arrayName, index] = arrayMatch;
            current = current[arrayName];
            if (Array.isArray(current)) {
                current = current[parseInt(index)];
            } else {
                return undefined;
            }
        } else {
            current = current[part];
        }
    }

    return current;
};

// Initialize Groq client helper
// Initialize Groq client helper
const getGroqClient = async (userId: string) => {
    // Find credential for this specific user
    const cred = await Credential.findOne({ service: 'groq', userId });

    // Fallback to env var ONLY if it's the system user or explicitly allowed (optional)
    // For now, if no user cred, try env var as a "global" fallback, 
    // but in a strict multi-tenant system you might want to force user creds.
    const apiKey = cred ? cred.value : process.env.GROQ_API_KEY;

    if (!apiKey) throw new Error("Groq API Key not found. Please add it in Settings > Credentials.");
    return new Groq({ apiKey });
};


export const executeNode = async (node: any, inputData: any, nodeOutputs: Record<string, any> = {}, userId: string = 'system') => {
    const { type, data } = node;

    try {
        switch (type) {
            case 'manualTrigger':
                let triggerOutput = inputData;
                if ((!triggerOutput || (typeof triggerOutput === 'object' && Object.keys(triggerOutput).length === 0)) && data.testData) {
                    try {
                        triggerOutput = JSON.parse(data.testData);
                    } catch (e) {
                        triggerOutput = { message: data.testData };
                    }
                }
                return { success: true, output: triggerOutput || { message: "Workflow started manually" } };

            case 'httpRequest':
                if (!data.url) throw new Error("URL is required");
                const response = await axios({
                    method: data.method || 'GET',
                    url: data.url,
                    headers: data.headers ? JSON.parse(data.headers) : {},
                    data: data.body ? JSON.parse(data.body) : undefined
                });
                return { success: true, output: response.data, statusCode: response.status };

            case 'aiModel':
                const groq = await getGroqClient(userId);
                // Construct prompt using inputData or data.prompt
                // Allow dynamic injection if prompt contains {{input}}
                let prompt = data.prompt || "";
                if (inputData && typeof inputData === 'object') {
                    prompt += `\n\nContext: ${JSON.stringify(inputData)}`;
                }

                const completion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: data.model || 'mixtral-8x7b-32768',
                    temperature: parseFloat(data.temperature) || 0.7,
                    max_tokens: parseInt(data.maxTokens) || 1024,
                });
                return { success: true, output: completion.choices[0]?.message?.content };

            case 'code':
                const code = data.code;
                const sandbox = { input: inputData, output: {}, console: { log: () => { } } }; // Basic sandbox
                vm.createContext(sandbox);
                vm.runInContext(code, sandbox);
                return { success: true, output: sandbox.output };

            case 'excel':
                if (data.operation === 'write') {
                    const content = data.jsonData ? JSON.parse(data.jsonData) : (Array.isArray(inputData) ? inputData : [inputData]);
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.json_to_sheet(content);
                    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
                    XLSX.writeFile(wb, data.filePath);
                    return { success: true, output: `Successfully wrote ${content.length} rows to ${data.filePath}` };
                } else {
                    if (!fs.existsSync(data.filePath)) throw new Error(`File not found: ${data.filePath}`);
                    const workbook = XLSX.readFile(data.filePath);
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    return { success: true, output: json };
                }

            case 'whatsapp':
                const sendWhatsApp = async (item: any) => {
                    // Resolve variables using the current item
                    const to = resolveVariables(data.to, item, nodeOutputs);
                    const message = resolveVariables(data.message, item, nodeOutputs);
                    const from = data.from; // Fixed from number

                    if (!to) throw new Error("Missing 'To' number after resolving variables");

                    if (data.accountSid && data.authToken) {
                        const client = twilio(data.accountSid, data.authToken);
                        const msg = await client.messages.create({
                            body: message,
                            from: from,
                            to: to
                        });
                        return { status: 'sent', sid: msg.sid, to };
                    }
                    return { status: 'simulated', to, message };
                };

                if (Array.isArray(inputData)) {
                    // Batch processing
                    const results = [];
                    for (const item of inputData) {
                        try {
                            const res = await sendWhatsApp(item);
                            results.push(res);
                        } catch (err: any) {
                            results.push({ status: 'error', error: err.message, item });
                        }
                    }
                    return { success: true, output: `Processed ${results.length} messages`, details: results };
                } else {
                    // Single processing
                    const result = await sendWhatsApp(inputData);
                    return { success: true, output: result };
                }

            case 'slack':
                if (data.webhookUrl) {
                    await axios.post(data.webhookUrl, { text: data.message });
                    return { success: true, output: "Slack message sent via Webhook" };
                }
                return { success: true, output: `[SIMULATION] Slack to ${data.channel}: "${data.message}"` };

            case 'gmail':
                console.log('\n📧 GMAIL NODE HANDLER');
                console.log('  Config data.to:', data.to);
                console.log('  Config data.subject:', data.subject);
                console.log('  Config data.body:', data.body);
                console.log('  Config data.user:', data.user);
                console.log('  Config data.pass:', data.pass ? '***configured***' : 'NOT SET');
                console.log('  Input Data Type:', typeof inputData);
                console.log('  Input Is Array:', Array.isArray(inputData));

                const sendEmail = async (item: any, index: number = 0) => {
                    console.log(`\n  📨 Processing email ${index + 1}:`);
                    console.log('    Item data:', JSON.stringify(item, null, 2));

                    const resolve = (str: string) => {
                        const resolved = resolveVariables(str, item, nodeOutputs);
                        console.log(`    Resolving "${str}" => "${resolved}"`);
                        return resolved;
                    };

                    const to = resolve(data.to);
                    const subject = resolve(data.subject);
                    const body = resolve(data.body);

                    console.log('    Final values:');
                    console.log('      To:', to);
                    console.log('      Subject:', subject);
                    console.log('      Body:', body.substring(0, 100) + '...');

                    if (!to || to.trim() === '') {
                        throw new Error('No recipients defined');
                    }

                    if (data.user && data.pass) {
                        console.log('    ✉️ Sending real email...');
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: { user: data.user, pass: data.pass }
                        });
                        const info = await transporter.sendMail({
                            from: data.user,
                            to: to,
                            subject: subject,
                            text: body
                        });
                        console.log('    ✅ Email sent! Message ID:', info.messageId);
                        return { status: 'sent', messageId: info.messageId, to };
                    }
                    console.log('    ⚠️ Simulated send (no credentials)');
                    return { status: 'simulated', to, subject };
                };

                if (Array.isArray(inputData)) {
                    console.log(`  Processing ${inputData.length} emails in batch...`);
                    const results = [];
                    for (let i = 0; i < inputData.length; i++) {
                        const item = inputData[i];
                        try {
                            const res = await sendEmail(item, i);
                            results.push(res);
                        } catch (err: any) {
                            console.log(`    ❌ Error on item ${i + 1}:`, err.message);
                            results.push({ status: 'error', error: err.message, item });
                        }
                    }
                    return { success: true, output: `Processed ${results.length} emails`, details: results };
                } else {
                    const result = await sendEmail(inputData);
                    return { success: true, output: `Email process result`, result };
                }

            case 'discord':
                if (!data.webhookUrl) throw new Error("Webhook URL is required");
                await axios.post(data.webhookUrl, { content: data.content });
                return { success: true, output: "Discord message sent successfully" };

            default:
                return { success: true, output: inputData };
        }
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

