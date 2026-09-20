# 自动图片处理

照常写博客 Markdown 或 HTML img，将本地图片放在 public/images 下，使用 /images/... 路径。npm run build 会自动生成 640、960、1600px WebP 阅读版本，不放大小图。现有部署任务无需修改。

- 原图保留；正文不裁剪，PNG 用无损编码保留图表信息，照片用高质量压缩。
- 正文图片按需加载并预留尺寸；点击未带链接的图片会在新标签页打开原图，已有链接不替换。
- 封面沿用 cover_fit；浏览器自行选择所需尺寸。
- 内容哈希决定衍生文件名。同名替换后重新构建，会刷新资源与 Markdown 缓存。
- 衍生图在 public/images/generated 中，构建时生成，无需提交或手改。
- SVG、GIF、动画图片、远程图片及无法读取的图片保留原方式，不转码，不下载外部资源。
- Sharp 随 npm install 安装，无需手动安装 cwebp。

验证：构建后执行 node scripts/verify-cover-images.mjs。
