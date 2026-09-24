'use client';

import {useState} from 'react';
import {ClipboardCopy, Phone} from 'lucide-react';
import {activeContactChannels} from '@/lib/merchant-config';
import {copyText} from '@/lib/clipboard';

export default function ContactOptions({lang = 'zh'}: {lang?: 'zh' | 'en'}) {
  const [notice, setNotice] = useState('');
  const english = lang === 'en';
  const channels = activeContactChannels();
  if (!channels.length) return null;
  return <div className="merchant-contact">
    <div className="merchant-contact-grid">
      {channels.map(channel => <div className="merchant-contact-card" key={channel.id}>
        <span className="merchant-contact-label">{channel.kind === 'wechat' ? (english ? 'WeChat' : '微信咨询') : channel.kind === 'phone' ? (english ? 'Phone' : '电话咨询') : channel.label}</span>
        <strong className="merchant-contact-value">{channel.value}</strong>
        {channel.kind === 'wechat' ? <button className="button dark" onClick={async () => {
          const copied = await copyText(channel.value);
          setNotice(copied ? (english ? 'WeChat ID copied. Add this account in WeChat to discuss your design.' : '微信号已复制，请打开微信添加，发送你的定制方案。')
            : (english ? 'Automatic copying is unavailable. Select the WeChat ID above and copy it manually.' : '未能自动复制，请长按上方微信号手动复制。'));
        }}><ClipboardCopy size={16}/>{english ? 'Copy WeChat ID' : '复制微信号'}</button> :
          <a className="button" href={channel.kind === 'phone' ? `tel:${channel.value}` : channel.kind === 'email' ? `mailto:${channel.value}` : channel.value}
            target={channel.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer">
            {channel.kind === 'phone' && <Phone size={16}/>} {english && channel.kind === 'phone' ? 'Call to discuss' : channel.label}
          </a>}
      </div>)}
    </div>
    <p className="merchant-contact-note">{english ? 'Mention “tissue box customization” and share your design, quantity and preferences. Confirm the quote before purchasing.' : '添加时请备注“纸巾盒定制”，发送方案、数量和需求。确认材料、报价与交期后再购买。'}</p>
    <p className="merchant-contact-status" role="status" aria-live="polite">{notice}</p>
  </div>;
}
