'use client';
import {useRef,useState} from 'react';
import ProductView,{ProductHandle} from './product-view';
import {initialDesign} from '@/lib/design';
import {Switch} from '@/components/ui/switch';

const views=[['hero','整体','白皮蓝边基准款，长 16 cm、宽 10.5 cm、高约 6 cm。'],['short','窄端','上下包角之间露出主体皮料，主体接合使用内缝。'],['corner','包角与弧边','连续包角跨过侧高；两段弧边保留贴合油边与外轮廓针脚。'],['tip','布标侧端头','revision7 已确认的局部网格连接，观察端头与油边的衔接。'],['overlap','顶部搭接','两条口沿在端部收拢，上下部分搭接，下层露边并保留抽纸通道。'],['top','顶部','查看抽纸口及四个包角的顶部折合。'],['bottom','底部','主体连续折到底部，没有独立窄端盖。'],['grain','皮纹近景','40 mm 物理周期的细密浅纹，采用柔和半哑光。']] as const;
export default function ModelReview(){
  const [view,setView]=useState<string>('hero'),[design,setDesign]=useState(()=>{const d=initialDesign();d.label.enabled=true;return d;}),[ready,setReady]=useState(false);
  const handle=useRef<ProductHandle|null>(null);
  function choose(name:string){setView(name);handle.current?.view(name);}
  return <main className="model-review live-review"><header><a className="brand" href="/"><span className="brand-mark">D</span><span>鼎立车眷<small>DINGLI CHEJUAN</small></span></a><a href="/customize" className="button dark">返回定制工坊</a></header>
    <div className="review-intro"><p className="eyebrow">REVISION 7</p><h1>当前网页模型校对</h1><p>拖动旋转，滚轮缩放；选择局部视角查看已确认结构。</p></div>
    <div className="review-live-workspace"><section className="review-live-stage"><ProductView design={design} selected="" onSelect={()=>{}} showTissue={false} rotating={false} onReady={h=>{handle.current=h;h.view('hero');setReady(true);}}/></section>
    <aside className="review-controls"><div className="review-view-buttons">{views.map(([key,name])=><button key={key} className={view===key?'active':''} disabled={!ready} onClick={()=>choose(key)}>{name}</button>)}</div><p>{views.find(v=>v[0]===view)?.[2]}</p>
      <label className="switch-line">显示布标<Switch aria-label="显示布标" checked={design.label.enabled} onCheckedChange={enabled=>setDesign({...design,label:{...design.label,enabled}})}/></label>
      <button className="button" disabled={!ready} onClick={()=>{const a=document.createElement('a');a.href=handle.current!.capture();a.download=`revision7-${view}.png`;a.click();}}>下载当前视角 PNG</button>
      <p className="review-note">皮纹是依据实拍制作的程序化近似。模型细节尺寸用于展示，不是生产裁切尺寸。</p>
    </aside></div>
    <section className="review-source"><h2>已确认的 Blender 参考</h2><p>下图来自保存的 revision7，用于与上方实时网页模型对照。</p><div><figure><img src="/model-review/revision7/label-tip-blender.png" alt="revision7 布标侧包角参考"/><figcaption>布标侧整体</figcaption></figure><figure><img src="/model-review/revision7/tip-close-blender.png" alt="revision7 已修正端头近景参考"/><figcaption>已确认端头近景</figcaption></figure></div></section>
  </main>;
}


