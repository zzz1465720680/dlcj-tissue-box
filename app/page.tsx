import { ArrowUpRight, ChevronRight } from 'lucide-react';
export default function Home() {
  return (
    <div className="sc-showcase">
      <a className="sc-skipLink" href="#collection">跳转到产品展示</a>
      <header className="sc-header">
        <nav className="sc-nav" aria-label="主导航">
          <a href="/" className="sc-logo" aria-label="鼎立车眷首页">
            <img src="/favicon.svg" alt="" width="30" height="30" />
            <span>鼎立车眷</span>
          </a>
          <div className="sc-navLinks">
            <a href="#collection" aria-current="page">车载纸巾盒</a>
            <a href="#details">产品细节</a>
            <a href="/customize">定制工坊</a>
          </div>
          <a href="/customize" className="sc-navCta">开始定制 <ArrowUpRight size={14} /></a>
        </nav>
      </header>
      <main>
        <section id="collection" className="sc-collection" aria-labelledby="collection-title">
          <div className="sc-titleRow">
            <h1 id="collection-title">车载纸巾盒</h1>
            <p>把讲究，带进日常。</p>
          </div>
          <div className="sc-collectionLabel">
            <span className="sc-collectionName">白色撞色系列</span>
            <span className="sc-colorDots" aria-label="清新绿、晴空蓝、暖杏橙三款配色"><i /><i /><i /></span>
            <span className="sc-collectionNote">一抹色彩，恰到好处。</span>
          </div>
          <article className="sc-hero">
            <img className="sc-heroImage" src="/showcase/hero-studio-1672.webp" srcSet="/showcase/hero-studio-840.webp 840w, /showcase/hero-studio-1672.webp 1672w" sizes="(max-width: 600px) 115vw, (max-width: 1552px) 92vw, 1440px" alt="白色纸巾盒，绿色包边与打孔包角" width="1672" height="941" fetchPriority="high" />
            <div className="sc-heroTop">
              <div>
                <p className="sc-eyebrow">鼎立车眷 · 车载纸巾盒</p>
                <h2>小物，也有讲究。</h2>
                <p className="sc-heroDescription">细腻纹理。利落线条。刚刚好的色彩。</p>
              </div>
              <div className="sc-heroActions">
                <a className="sc-button" href="#customization">探索定制 <ChevronRight size={17} /></a>
                <a className="sc-textLink" href="#details">看看细节 <ChevronRight size={16} /></a>
              </div>
            </div>
            <div className="sc-heroCaption"><span>白色为底，清新点睛。</span><span>清新绿</span></div>
          </article>
        </section>

        <section id="customization" className="sc-section sc-customSection" aria-labelledby="custom-title">
          <a href="/customize" className="sc-customPoster" aria-label="进入定制工坊，设计你的纸巾盒">
            <img className="sc-customImage" src="/showcase/customize-collection-1672.webp" srcSet="/showcase/customize-collection-840.webp 840w, /showcase/customize-collection-1672.webp 1672w" sizes="(max-width: 600px) 150vw, (max-width: 1552px) 92vw, 1440px" width="1672" height="941" alt="白色主体搭配清新绿、晴空蓝、暖杏橙包边的三款纸巾盒" loading="lazy" decoding="async" />
            <div className="sc-customCopy">
              <p className="sc-eyebrow">定制工坊</p>
              <h2 id="custom-title">一件日常，<br />你的模样。</h2>
              <p className="sc-customDescription">从配色到图案，<br />把喜欢的样子，变成自己的设计。</p>
              <span className="sc-button sc-lightButton">开始定制 <ArrowUpRight size={18} /></span>
            </div>
            <div className="sc-customFooter"><span>材质 · 配色 · 图案 · 细节</span><span>实时 3D 预览 <ArrowUpRight size={17} /></span></div>
          </a>
          <p className="sc-customNote">清新绿 / 晴空蓝 / 暖杏橙 <span>从一抹灵感开始，自由搭配。</span></p>
        </section>

        <section id="details" className="sc-detailsSection" aria-labelledby="details-title">
          <div className="sc-section sc-detailInner">
            <div className="sc-sectionHeading">
              <h2 id="details-title">细看，才更动心。</h2>
              <p>一处纹理，一道线条。<br />把对日常的用心，放进细节里。</p>
            </div>
            <div className="sc-detailGrid">
              <article className="sc-detailCard">
                <div className="sc-detailMedia">
                  <img className="sc-craftImage" src="/showcase/craft-detail-1086.webp" srcSet="/showcase/craft-detail-600.webp 600w, /showcase/craft-detail-1086.webp 1086w" sizes="(max-width: 600px) 90vw, 44vw" width="1086" height="1448" loading="lazy" decoding="async" alt="白色皮纹、细密缝线、绿色包边与打孔包角的近景" />
                </div>
                <div className="sc-detailCopy">
                  <p className="sc-cardLabel">纹理与线条</p>
                  <h3>细节，自有分寸。</h3>
                  <p>细腻皮纹与打孔包角相映，<br />一道撞色包边，勾勒利落轮廓。</p>
                </div>
              </article>
              <article className="sc-detailCard">
                <div className="sc-detailMedia">
                  <img className="sc-sceneImage" src="/showcase/car-scene-941.webp" srcSet="/showcase/car-scene-600.webp 600w, /showcase/car-scene-941.webp 941w" sizes="(max-width: 600px) 90vw, 44vw" width="941" height="1672" loading="lazy" decoding="async" alt="白绿纸巾盒置于深色汽车座椅上的场景示意" />
                  <span className="sc-sceneNote">场景示意</span>
                </div>
                <div className="sc-detailCopy">
                  <p className="sc-cardLabel">车内日常</p>
                  <h3>小小一隅，也有生活感。</h3>
                  <p>让一抹清新，与车内的色调相处。<br />日常小物，也可以是喜欢的风景。</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="sc-closing" aria-labelledby="closing-title">
          <p className="sc-eyebrow">鼎立车眷</p>
          <h2 id="closing-title">把讲究，带进日常。</h2>
          <a className="sc-textLink" href="/customize">设计我的纸巾盒 <ArrowUpRight size={18} /></a>
        </section>
      </main>
      <footer className="sc-footer">
        <span>鼎立车眷 <span className="sc-wordmark">DINGLI CHEJUAN</span></span>
        <span>页面配色与定制效果供参考，成品以实物打样为准。</span>
      </footer>
    </div>
  );
}
