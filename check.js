const { prebuiltAppConfig } = require('@mlc-ai/web-llm');
console.log(prebuiltAppConfig.model_list.find(m => m.model_id.includes('Qwen2.5-3B')));
