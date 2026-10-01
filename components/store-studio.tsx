'use client';
import Studio from './studio';
import {designRequest} from '@/lib/store-client';
import {localDesignRequest} from '@/netlify-browser/local-design-api';

/** Keep browser-local recovery explicit; login never migrates private designs silently. */
export default function StoreStudio({lightPreview=false, localOnly=false, initialDesignId}: {lightPreview?: boolean; localOnly?: boolean; initialDesignId?: string}) {
  return <Studio lightPreview={lightPreview} localOnly={localOnly} initialDesignId={initialDesignId} designRequest={localOnly ? localDesignRequest : designRequest}/>;
}
