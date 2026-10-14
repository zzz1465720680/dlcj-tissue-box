'use client';
import Studio from './studio';
import {designRequest} from '@/lib/store-client';
import {hybridDesignRequest, localDesignRequest} from '@/netlify-browser/local-design-api';
import {frontendPreview, netlifyPricing} from '@/lib/frontend-preview';

/** Keep browser-local recovery explicit; login never migrates private designs silently. */
export default function StoreStudio({lightPreview=false, localOnly=false, initialDesignId, embedded=false, onBack}: {lightPreview?: boolean; localOnly?: boolean; initialDesignId?: string; embedded?: boolean; onBack?: ()=>void}) {
  return <Studio lightPreview={lightPreview} localOnly={localOnly} initialDesignId={initialDesignId} embedded={embedded} onBack={onBack} designRequest={netlifyPricing && !frontendPreview ? hybridDesignRequest : localOnly ? localDesignRequest : designRequest}/>;
}
