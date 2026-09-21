import { Badge, Icon, PageHeading } from "../components/ui";
import { FileUpload } from "../components/FileUpload";
import { contentInfo } from "../demo/data";
import type { ContentKind } from "../demo/data";
export function Content({ kind }: { kind: ContentKind }) {
  const info = contentInfo[kind];
  return (
    <>
      <PageHeading
        eyebrow="THOUGHTFULLY PREPARED RESOURCES"
        title={info.title}
        description={info.subtitle}
      />
      <div className="content-grid">
        <section className="panel upload-panel">
          <div className="section-title">
            <span className="section-icon">
              <Icon name="upload" />
            </span>
            <div>
              <h2>上传{info.title}</h2>
              <p>{info.description}</p>
            </div>
          </div>
          <FileUpload kind={kind} />
        </section>
        <aside className="resource-guide">
          <div className="guide-illustration" aria-hidden="true">
            <span>{info.letter}</span>
            <Icon name="leaf" size={45} />
            <i />
          </div>
          <span className="eyebrow">A SMALL GUIDE</span>
          <h2>
            好的材料，
            <br />
            是成长的起点。
          </h2>
          <ol>
            <li>
              <strong>准备材料</strong>
              <p>将需要导入的文件整理好。</p>
            </li>
            <li>
              <strong>选择并提交</strong>
              <p>确认文件后，体验上传流程。</p>
            </li>
            <li>
              <strong>查看结果</strong>
              <p>成功摘要和错误位置会在下方展示。</p>
            </li>
          </ol>
          <p className="guide-note">
            当前为交互演示，文件不会上传或解析。文件格式与大小限制将在接口确定后对齐。
          </p>
        </aside>
      </div>
      <section className="panel resource-list">
        <div className="section-title">
          <div>
            <h2>材料示例</h2>
            <p>预览导入后材料的展示方式</p>
          </div>
          <span className="subtle-tag">示例数据</span>
        </div>
        <div className="resource-row">
          <span className="file-icon">
            <Icon name="file" size={25} />
          </span>
          <div className="resource-name">
            <strong>{info.name}</strong>
            <p>{info.meta}</p>
          </div>
          <span className="muted resource-date">2026-09-21</span>
          <Badge status="READY" />
        </div>
      </section>
    </>
  );
}
