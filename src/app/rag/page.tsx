import { Metadata } from 'next';
import { RagDashboardClient } from '@/components/rag/RagDashboardClient';

export const metadata: Metadata = {
    title: '神经网络记忆舱 | Yasi',
    description: '完全本地运行的 RAG 向量记忆中枢',
};

export default function RagPage() {
    return <RagDashboardClient />;
}
