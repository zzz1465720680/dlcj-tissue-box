'use client';
/* eslint-disable @next/next/no-img-element -- Reuse the existing local product photographs. */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { Lang } from '@/lib/showcase-copy';

const MODELS=[['01_driver','主驾脚垫'],['02_passenger','右上前排'],['03_transverse','横向连体'],['04_lower','下方双 U 口'],['all','整套四块']];
const MATERIALS=[['Mat_Edge','包边','#ffcc00','edge'],['Mat_Accent','侧边皮革','#ffcc00','accent'],['Mat_Stitch','缝线','#f9e8b6','stitch'],['Mat_Embroidery','图案线色','#6c4621','embroidery']];

export default function MatConfigurator({lang,started,onStart}: {lang:Lang;started:boolean;onStart:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!started||!root.current)return;
    const el=root.current;
    let cancelled=false,dispose:(()=>void)|undefined;
    el.dataset.loaded='false';delete el.dataset.error;
    import('./mat-viewer').then(module=>module.createMatViewer(el)).then(viewer=>{
      if(!viewer)return;
      if(cancelled){viewer.dispose();return;}
      dispose=viewer.dispose;
      if(process.env.NODE_ENV==='development')Object.defineProperty(el,'__floorMatViewer',{value:viewer,configurable:true});
    }).catch(()=>{
      if(cancelled)return;
      el.dataset.error='true';el.dataset.loaded='false';
      const status=el.querySelector('#fm3-status');
      if(status)status.textContent='三维预览暂时无法打开，可重试或继续查看实拍图。';
    });
    return ()=>{cancelled=true;dispose?.();};
  },[started,attempt]);

  if(!started)return <section id="mats-design" className="sh-custom fm-designIntro" aria-labelledby="fm-design-title">
    <div className="sh-customCopy"><div><p className="sh-eyebrow">{lang==='zh'?'自由搭配':'YOUR COMBINATION'}</p><h2 id="fm-design-title">{lang==='zh'?'喜欢的配色，自己搭配。':'Your colours. Your combination.'}</h2><p className="sh-customBody">{lang==='zh'?'从正面面料到包边、皮革与缝线，搭配你的脚垫。':'Choose a fabric and adjust the edging, leather and stitching.'}</p></div><div className="sh-customActions"><span className="fm-quote">{lang==='zh'?'搭配预览':'3D preview'}</span><button type="button" className="sh-button sh-buttonOutline" onClick={onStart}>{lang==='zh'?'开始搭配':'Start designing'}<ArrowRight size={20}/></button></div></div>
    <figure className="fm-designPhoto"><img src="/floor-mats/black-gray-grid-800.webp" width="800" height="450" alt={lang==='zh'?'脚垫配色实拍参考':'Floor-mat colour reference'} loading="lazy"/><figcaption>{lang==='zh'?'实拍参考 · 点击打开三维搭配':'Product reference · Open 3D to start'}</figcaption></figure>
  </section>;

  return <section id="mats-design" className="fm3-designer" aria-labelledby="fm3-heading">
    <div className="fm3-heading"><div><p className="sh-eyebrow">{lang==='zh'?'自由搭配':'YOUR COMBINATION'}</p><h2 id="fm3-heading">{lang==='zh'?'设计你的脚垫':'Design your floor mats'}</h2></div><a href="#mats-title">{lang==='zh'?'回到款式展示':'Back to photographs'}</a></div>
    <div ref={root} className="fm3-shell" data-loaded="false">
      <div className="fm3-preview">
        <div className="fm3-stage">
          <img className="fm3-fallback" src="/floor-mats/black-gray-grid-800.webp" width="800" height="450" alt="脚垫实拍替代展示"/>
          <canvas id="fm3-view" aria-label="脚垫三维预览，可拖动旋转与双指缩放"/>
          <div className="fm3-zoom" aria-label="缩放"><button type="button" data-zoom="in" aria-label="放大脚垫">＋</button><button type="button" data-zoom="out" aria-label="缩小脚垫">－</button></div>
          <div className="fm3-views" role="group" aria-label="脚垫视角">{[['hero','整体'],['top','正面'],['long','缝线长边'],['upper','上端接点'],['detail','下端接点'],['notch','U 型开口'],['bottom','背面']].map(([view,label])=><button type="button" data-view={view} key={view} aria-pressed={view==='hero'}>{label}</button>)}</div>
        </div>
        <div className="fm3-previewFooter"><p id="fm3-status" role="status" aria-live="polite">正在准备三维搭配…</p><button className="fm3-retry" type="button" onClick={()=>setAttempt(n=>n+1)}>重试三维预览</button><span>拖动旋转 · 滚轮或双指缩放</span></div>
      </div>
      <aside className="fm3-panel" aria-label="脚垫搭配选项">
        <label className="fm3-field" htmlFor="fm3-model">选择脚垫<select id="fm3-model" defaultValue="01_driver">{MODELS.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>
        <label className="fm3-field" htmlFor="fm3-fabric">正面面料<select id="fm3-fabric" defaultValue="houndstooth" aria-describedby="fm3-fabric-status">{[['houndstooth','黑白千鸟格'],['jacquard','灰色字母提花'],['twill','深灰斜纹'],['green','绿黑白千鸟格'],['plain','素色织物']].map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>
        <p className="fm3-fieldHint" id="fm3-fabric-status" role="status" aria-live="polite">面料只应用于中间区域。</p><button id="fm3-fabric-retry" className="fm3-fabricRetry" type="button">重试所选面料</button>
        {MATERIALS.map(([material,title,color,section])=><fieldset className="fm3-colorGroup" id={`fm3-${section}-section`} key={material}><legend>{title}</legend><div className="fm3-colors"><div className="fm3-swatches" data-material={material}/><label className="fm3-customColor">自选<input type="color" aria-label={`自选${title}颜色`} data-color={material} defaultValue={color}/></label></div></fieldset>)}
        <label className="fm3-field" id="fm3-bottom-section" htmlFor="fm3-bottom">底部效果<select id="fm3-bottom" defaultValue="grip"><option value="grip">细颗粒效果</option><option value="smooth">平滑效果</option></select></label>
        <button id="fm3-reset" type="button" className="fm3-reset"><RotateCcw size={15}/>恢复默认搭配</button>
        <p className="fm3-note">展示模型，尺寸与底部构造需以实物确认。新增面料依据照片整理，非实物扫描。当前搭配不提交订单。</p>
      </aside>
    </div>
  </section>;
}
