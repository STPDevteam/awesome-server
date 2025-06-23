import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001/api';
const TEST_USER_ID = 'test-user-id-http-flow';

const log = (message, data = '') => {
  console.log(`\n--- ${message} ---\n`, data);
};

const handleStream = async (response, onData) => {
  if (!response.body) {
    throw new Error('Response body is null');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.substring(6);
        if (jsonStr === '[DONE]') {
          log('Stream finished.');
          return;
        }
        try {
          const data = JSON.parse(jsonStr);
          onData(data);
        } catch (error) {
          log('Error parsing stream data chunk', jsonStr);
        }
      }
    }
  }
};

const runTest = async () => {
  let taskId;
  const taskContent = "I want to cook a perfect medium-rare steak. Give me a step-by-step guide.";

  try {
    // 1. Create a new task
    log('1. Creating a new task...');
    const createTaskResponse = await fetch(`${API_BASE_URL}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: taskContent,
        userId: TEST_USER_ID,
      }),
    });
    const { data: { task } } = await createTaskResponse.json();
    taskId = task.id;
    log('Task created successfully', { taskId, title: task.title });

    // 2. Analyze the task (streamed)
    log(`2. Analyzing task ${taskId} (streaming)...`);
    const analyzeResponse = await fetch(`${API_BASE_URL}/task/${taskId}/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
    });
    await handleStream(analyzeResponse, (data) => {
        console.log('Analysis Stream Data:', data);
    });

    // 3. Get task details and check for workflow
    log(`3. Fetching task details for ${taskId} to check workflow...`);
    const detailsResponse = await fetch(`${API_BASE_URL}/task/${taskId}?userId=${TEST_USER_ID}`);
    const { data: taskDetails } = await detailsResponse.json();
    log('Workflow generated:', taskDetails.task.mcpWorkflow);
    if (!taskDetails.task.mcpWorkflow || taskDetails.task.mcpWorkflow.workflow.length === 0) {
      throw new Error('Workflow generation failed.');
    }

    // 4. Execute the task (streamed)
    log(`4. Executing task ${taskId} (streaming)...`);
    const executeResponse = await fetch(`${API_BASE_URL}/task/${taskId}/execute/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
    });
     await handleStream(executeResponse, (data) => {
        console.log('Execution Stream Data:', data);
    });

    // 5. Get final task result
    log(`5. Fetching final result for task ${taskId}...`);
    const finalResultResponse = await fetch(`${API_BASE_URL}/task/${taskId}?userId=${TEST_USER_ID}`);
    const { data: finalTask } = await finalResultResponse.json();
    log('Final task status:', finalTask.task.status);
    log('Final task result:', finalTask.task.result);

    if (finalTask.task.status !== 'completed') {
        throw new Error(`Test failed! Task status is ${finalTask.task.status}`);
    }

    console.log('\n✅✅✅ HTTP Flow Test Completed Successfully! ✅✅✅');

  } catch (error) {
    console.error('\n❌❌❌ Test Failed ❌❌❌');
    console.error(error);
    process.exit(1);
  }
};

runTest(); 