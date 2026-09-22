import type {Metadata} from 'next';
import ModelReview from '@/components/model-review';
export const metadata:Metadata={title:'revision7 模型校对 · 鼎立车眷',description:'当前网页模型的窄端、包角、油边、顶部搭接和布标端头检查。'};
export default function Page(){return <ModelReview/>;}
