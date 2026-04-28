import { prebuiltAppConfig } from '@mlc-ai/web-llm';
console.log(prebuiltAppConfig.model_list.map(m => m.model_id).filter(m => m.includes('Qwen2')));
