import type {Metadata} from 'next';
import ModelReview from '@/components/model-review';
export const metadata:Metadata={title:'revision9 模型校对 · 鼎立车眷',description:'当前网页模型的窄端、包角缝线、固定孔位、油边与顶部搭接检查。'};
export default function Page(){return <ModelReview/>;}
