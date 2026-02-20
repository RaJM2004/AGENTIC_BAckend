
import { Execution } from '../models/Execution';
import { executeNode } from './nodeHandlers';

// Helper to build adjacency list
const buildGraph = (nodes: any[], edges: any[]) => {
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => adj[n.id] = []);
    edges.forEach(e => {
        if (adj[e.source]) {
            adj[e.source].push(e.target);
        }
    });
    return adj;
};

export const runWorkflow = async (workflow: any, triggerType: string = 'manual', initialData: any = {}, userId: string = 'system') => {
    console.log('\n========================================');
    console.log('🚀 WORKFLOW EXECUTION STARTED');
    console.log('========================================');
    console.log('Workflow ID:', workflow._id);
    console.log('User ID:', userId);
    console.log('Trigger Type:', triggerType);
    console.log('Initial Data:', JSON.stringify(initialData, null, 2));
    console.log('----------------------------------------\n');

    // Create Execution Record
    const execution = new Execution({
        workflowId: workflow._id,
        userId: userId,
        status: 'running',
        startedAt: new Date(),
        nodeLogs: []
    });
    await execution.save();
    console.log('✅ Execution record created:', execution._id);

    const { nodes, edges } = workflow;
    console.log('\n📊 Workflow Structure:');
    console.log('  Total Nodes:', nodes.length);
    console.log('  Total Edges:', edges.length);
    nodes.forEach((n: any) => {
        console.log(`  - ${n.type} (${n.id})`);
    });

    const adj = buildGraph(nodes, edges);
    console.log('\n🔗 Graph Structure:', JSON.stringify(adj, null, 2));

    // Find start node based on trigger type
    let currentNodeId;

    if (triggerType === 'webhook') {
        currentNodeId = nodes.find((n: any) => n.type === 'webhookTrigger' || (n.data && n.data.type === 'webhookTrigger'))?.id;
        console.log('\n🔍 Looking for webhook trigger node...');
    } else {
        // Default Manual
        currentNodeId = nodes.find((n: any) => n.type === 'manualTrigger' || (n.data && n.data.type === 'manualTrigger') || n.data.label === 'Manual Trigger')?.id;
        console.log('\n🔍 Looking for manual trigger node...');
    }

    if (!currentNodeId) {
        console.log('❌ ERROR: No trigger node found!');
        execution.status = 'failed';
        execution.nodeLogs.push({ nodeId: 'system', status: 'error', logs: `No trigger node found for type: ${triggerType}` });
        execution.finishedAt = new Date();
        await execution.save();
        return execution;
    }

    console.log('✅ Start Node Found:', currentNodeId);

    // IMPORTANT: Track all node outputs for data referencing
    const nodeOutputs: Record<string, any> = {};
    let currentData = initialData;
    const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]));
    const logs = [];
    let stepCount = 0;

    while (currentNodeId) {
        stepCount++;
        const node = nodeMap.get(currentNodeId);
        if (!node) {
            console.log(`⚠️ Warning: Node ${currentNodeId} not found in map`);
            break;
        }

        console.log('\n========================================');
        console.log(`⚡ STEP ${stepCount}: Executing ${node.type}`);
        console.log('========================================');
        console.log('Node ID:', node.id);
        console.log('Node Type:', node.type);
        console.log('Node Data:', JSON.stringify(node.data, null, 2));
        console.log('\n📥 INPUT to this node:');
        console.log('  Type:', typeof currentData);
        console.log('  Is Array:', Array.isArray(currentData));
        if (Array.isArray(currentData)) {
            console.log('  Array Length:', currentData.length);
            console.log('  First Item:', JSON.stringify(currentData[0], null, 2));
        } else {
            console.log('  Data:', JSON.stringify(currentData, null, 2));
        }
        console.log('\n🗄️ Available Node Outputs (Context):');
        Object.keys(nodeOutputs).forEach(nodeId => {
            console.log(`  - ${nodeId}:`, typeof nodeOutputs[nodeId]);
        });

        const startTime = new Date();
        console.log('\n⏳ Executing node handler...');

        const result = await executeNode(node, currentData, nodeOutputs, userId);
        const endTime = new Date();

        console.log('⏱️ Execution Time:', (endTime.getTime() - startTime.getTime()), 'ms');
        console.log('\n📤 OUTPUT from this node:');
        console.log('  Success:', result.success);
        if (result.success) {
            console.log('  Output Type:', typeof result.output);
            console.log('  Is Array:', Array.isArray(result.output));
            if (Array.isArray(result.output)) {
                console.log('  Array Length:', result.output.length);
                console.log('  First Item:', JSON.stringify(result.output[0], null, 2));
            } else {
                console.log('  Output:', JSON.stringify(result.output, null, 2));
            }
        } else {
            console.log('  ❌ ERROR:', result.error);
        }

        const logEntry = {
            nodeId: node.id,
            nodeType: node.type,
            status: result.success ? 'success' : 'error',
            input: currentData,
            output: result.output || result.error,
            startTime,
            endTime
        };
        logs.push(logEntry);

        execution.nodeLogs = logs;
        await execution.save();
        console.log('✅ Logs saved to database');

        if (!result.success) {
            console.log('\n❌❌❌ WORKFLOW FAILED ❌❌❌');
            console.log('Failed at node:', node.id);
            console.log('Error:', result.error);
            execution.status = 'failed';
            execution.finishedAt = new Date();
            await execution.save();
            return execution;
        }

        nodeOutputs[currentNodeId] = result.output;
        console.log(`\n💾 Stored output from ${currentNodeId} in context`);

        currentData = result.output;
        console.log('📦 Current data updated for next node');

        const nextNodes: string[] = adj[currentNodeId] || [];
        console.log('\n🔍 Next nodes:', nextNodes);

        if (nextNodes.length > 0) {
            currentNodeId = nextNodes[0];
            console.log('➡️ Moving to next node:', currentNodeId);
        } else {
            currentNodeId = undefined;
            console.log('🏁 No more nodes to execute');
        }
    }

    console.log('\n========================================');
    console.log('✅✅✅ WORKFLOW COMPLETED SUCCESSFULLY ✅✅✅');
    console.log('========================================');
    console.log('Total Steps:', stepCount);
    console.log('Execution Time:', new Date().getTime() - execution.startedAt.getTime(), 'ms');
    console.log('========================================\n');

    execution.status = 'completed';
    execution.finishedAt = new Date();
    await execution.save();
    return execution;
};
