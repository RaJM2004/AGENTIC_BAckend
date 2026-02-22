
import mongoose from 'mongoose';
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

        // Auto-fix for common mistake: using .output on a node (the node IS the output)
        if (field === 'output') {
            console.log(`    ⚠️ NOTE: accessing .output on node ${nodeId} - the node itself is the data. Removing suffix.`);
            field = undefined;
        }

        // Auto-fix for common mistake: using .response on aiModel (which returns string)
        if (field === 'response' && nodeId.startsWith('aiModel')) {
            console.log(`    ⚠️ NOTE: accessing .response on aiModel - auto-correcting to direct value`);
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


const extractId = (input: string) => {
    if (!input) return '';
    // If it's a URL, extract the ID part
    const googleMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const zohoMatch = input.match(/\/publishedsheet\/([a-zA-Z0-9-_]+)/) || input.match(/\/open\/([a-zA-Z0-9-_]+)/);

    if (googleMatch) return googleMatch[1];
    if (zohoMatch) return zohoMatch[1];

    // If it's already an ID (not a URL), just return it trimmed
    return input.trim();
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
                console.log(`\n📄 EXCEL NODE (${data.operation || 'read'})`);
                console.log('  File Path:', data.filePath);

                if (data.operation === 'write') {
                    let content;
                    try {
                        content = data.jsonData ? JSON.parse(data.jsonData) : inputData;
                    } catch (e) {
                        content = inputData;
                    }

                    // Ensure content is an array of objects
                    if (!Array.isArray(content)) {
                        content = [content];
                    }

                    // If items are not objects (e.g. strings from AI), wrap them
                    const formattedContent = content.map((item: any) => {
                        if (typeof item !== 'object' || item === null) {
                            return { "Content": String(item) };
                        }
                        return item;
                    });

                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.json_to_sheet(formattedContent);
                    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

                    const fullPath = data.filePath || 'exports/output.xlsx';
                    XLSX.writeFile(wb, fullPath);
                    return { success: true, output: `Successfully exported ${formattedContent.length} rows to ${fullPath}` };
                } else {
                    const readPath = data.filePath?.trim();
                    if (!readPath) throw new Error("File path or URL is required for reading");

                    let json;
                    if (readPath.startsWith('http')) {
                        console.log('  Fetching from Cloud URL:', readPath);
                        try {
                            const response = await axios.get(readPath, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                                },
                                responseType: 'arraybuffer' // Handle binary data like .xlsx
                            });
                            const workbook = XLSX.read(response.data);
                            const sheetName = workbook.SheetNames[0];
                            const sheet = workbook.Sheets[sheetName];
                            json = XLSX.utils.sheet_to_json(sheet);
                        } catch (err: any) {
                            if (err.response?.status === 404) {
                                throw new Error(`Cloud URL returned 404. If you are using Zoho/Google Sheets, ensure you have used the "Export as CSV" or "Download Link" URL, not the viewable page URL.`);
                            }
                            throw err;
                        }
                    } else {
                        if (!fs.existsSync(readPath)) {
                            throw new Error(`File not found: ${readPath}. Make sure the file exists or switch to 'Write Sheet' if you want to save data.`);
                        }
                        const workbook = XLSX.readFile(readPath);
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        json = XLSX.utils.sheet_to_json(sheet);
                    }
                    return { success: true, output: json };
                }

            case 'googleSheets':
                console.log('\n📊 GOOGLE SHEETS NODE');
                const { spreadsheetId: rawId, range, credentialId } = data;
                const spreadsheetId = extractId(rawId);
                if (!spreadsheetId) throw new Error("Spreadsheet ID or URL is required");

                if (rawId.includes('zoho')) {
                    throw new Error("You are using a Zoho URL in a Google Sheets node. Please use the 'Zoho Sheet' node from the sidebar instead.");
                }


                let apiKey = '';
                if (credentialId) {
                    const cred = await (mongoose.model('Credential')).findById(credentialId);
                    if (cred) apiKey = cred.value;
                }

                // Construct export URL if no API key, or use basic public fetch
                const sheetsUrl = apiKey
                    ? `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range || 'Sheet1!A:Z'}?key=${apiKey}`
                    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

                console.log('  Fetching from:', sheetsUrl);
                const sheetsRes = await axios.get(sheetsUrl, {
                    responseType: sheetsUrl.includes('export') ? 'arraybuffer' : 'json'
                });

                let sheetJson;
                if (sheetsUrl.includes('export')) {
                    const workbook = XLSX.read(sheetsRes.data);
                    const sheetName = workbook.SheetNames[0];
                    sheetJson = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                } else {
                    const rows = sheetsRes.data.values;
                    const headers = rows[0];
                    sheetJson = rows.slice(1).map((row: any[]) => {
                        const obj: any = {};
                        headers.forEach((h: string, i: number) => {
                            obj[h] = row[i];
                        });
                        return obj;
                    });
                }
                return { success: true, output: sheetJson };

            case 'zohoSheets':
                console.log('\n🛡️ ZOHO SHEETS NODE');
                const { workbookId: rawWbId, credentialId: zohoCredId } = data;
                const workbookId = extractId(rawWbId);
                if (!workbookId) throw new Error("Zoho Workbook ID or URL is required");

                if (rawWbId.includes('google')) {
                    throw new Error("You are using a Google Sheets URL in a Zoho node. Please use the 'Google Sheets' node from the sidebar instead.");
                }


                // Construct export URL
                // We will try the most common patterns in order
                const patterns = [
                    rawWbId.includes('http') ? rawWbId : null,
                    `https://sheet.zohopublic.in/sheet/publishedsheet/${workbookId}?download=csv`,
                    `https://sheet.zohopublic.in/sheet/publishedsheet/${workbookId}?type=grid&download=csv`,
                    `https://sheet.zohopublic.in/sheet/publishedsheet/${workbookId}?type=csv`,
                    `https://sheet.zohopublic.in/sheet/publishedsheet/${workbookId}/csv`,
                    `https://sheet.zohopublic.in/sheet/export/${workbookId}?format=csv`
                ].filter(Boolean);

                let zohoRes;
                let lastError;

                for (const url of patterns) {
                    try {
                        console.log('  Trying Zoho URL:', url);
                        zohoRes = await axios.get(url as string, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Referer': 'https://sheet.zoho.in/',
                                'Origin': 'https://sheet.zoho.in',
                                'Accept': 'text/csv,application/json,application/vnd.ms-excel'
                            },
                            responseType: 'arraybuffer',
                            timeout: 8000,
                            maxRedirects: 5
                        });
                        if (zohoRes.status === 200) break; // Success!
                    } catch (err: any) {
                        lastError = err;
                        console.log(`  Pattern failed (${url}):`, err.message);
                    }
                }

                if (!zohoRes) {
                    console.error('All Zoho patterns failed.');
                    if (lastError?.response?.status === 404) {
                        throw new Error("Zoho Sheet not found or not published. Double check that 'Allow download' is checked in the Zoho Publish menu and use the link from the 'Downloadable Link' tab.");
                    }
                    throw lastError || new Error("Failed to connect to Zoho Sheets");
                }

                try {
                    const workbook = XLSX.read(zohoRes.data);
                    const sheetName = workbook.SheetNames[0];
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    return { success: true, output: json };
                } catch (err: any) {
                    throw new Error("Zoho fetched successfully but failed to parse content. Ensure the sheet contains valid data.");
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
                            host: 'smtp.gmail.com',
                            port: 587,
                            secure: false, // use STARTTLS
                            auth: { user: data.user, pass: data.pass },
                            connectionTimeout: 10000, // 10 seconds
                            greetingTimeout: 10000,
                            socketTimeout: 15000
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

