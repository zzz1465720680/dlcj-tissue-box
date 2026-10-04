'use client';
import Studio from './studio';
import {designRequest} from '@/lib/store-client';
import {localDesignRequest} from '@/netlify-browser/local-design-api';

/** Keep browser-local recovery explicit; login never migrates private designs silently. */
export default function StoreStudio({lightPreview=false, localOnly=false, initialDesignId, embedded=false, onBack}: {lightPreview?: boolean; localOnly?: boolean; initialDesignId?: string; embedded?: boolean; onBack?: ()=>void}) {
  return <Studio lightPreview={lightPreview} localOnly={localOnly} initialDesignId={initialDesignId} embedded={embedded} onBack={onBack} designRequest={localOnly ? localDesignRequest : designRequest}/>;
}
