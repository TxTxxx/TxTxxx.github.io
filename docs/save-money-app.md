# 一点点攒钱本

入口为 `/save-money/`，随现有 GitHub Pages 工作流发布。源码全部放在 `public/save-money/`，不引入博客布局、样式或第三方运行时，不修改博客导航或构建配置。

## 数据与隔离

账本只保存在当前浏览器的 `txtxx.save-money.v1` localStorage 键中，不上传 GitHub，也不自动在设备间同步。设置中支持 JSON 导出与恢复；恢复前会校验并要求确认替换。网页本身公开可访问，`noindex` 不是访问控制。同源目录不构成安全边界；若需要安全边界，应迁移至独立源并重新设计数据访问。

Service Worker 的作用域仅为 `/save-money/`，缓存仅使用 `txtxx-save-money-` 前缀，不删除博客缓存。首次成功加载后可离线使用缓存的界面。发布资源更新时应修改 `sw.js` 的缓存版本，确保新安装缓存对应完整资源。

iPhone 用 Safari 打开正式入口，通过分享菜单添加到主屏幕。正式使用前从主屏幕入口设置额度并开始记账；浏览器与独立网页 App 的数据共享行为不应被当作跨设备同步保证。请定期导出到“文件”。

## 结算规则

金额使用整数分。每日额度按生效日期保存，设置修改从当天生效，不改写过去额度。每天仅保存一个消费总额，可修改和补记。

漏记日期不产生额度；结算只允许从开始日期起连续完整的日期。每日模式结算至最近连续记录日；每周模式结算至该范围内最近的周日。开始周只计算实际记录期间。已有其他日期的已知超支也会限制可转存金额。

可转存额为完整可结算日期的预算结余与全部已知日期预算结余中较小者，减去累计已确认转存，最低为零。待补超支为累计转存减去全部已知预算结余，最低为零。这保证切换模式不重复转存，修改历史或调低当天额度后也不会把实际转存撤回。

转存确认只是用户手动记录：应用没有支付接口，不跳过微信验证，也不能核实到账。用户去微信向个人收款码付款后，回到应用确认。确认界面会检查账本是否发生变化。

## 验证

运行 `node --test scripts/tests/save-money.test.mjs` 验证金额、超支、漏记、周结算、模式切换、历史修改、预算变更及备份校验。按仓库要求运行 `ASTRO_TELEMETRY_DISABLED=1 npm run build`。

开发服务器请使用 `/save-money/index.html` 预览；GitHub Pages 支持正式目录入口 `/save-money/`。WebMCP 支持检测后仅注册只读结算摘要；没有兼容上下文时不影响应用。

## 第二版界面与图标

深绿主色、浅灰工作区，累计转存与每日输入并列；手机上按概览、录入、转存排列。本周日期条只显示真实记录，并复用原有日期选择流程。预算使用条随输入更新；零超支时隐藏待补项。数据结构与存储键保持不变。

备份说明改为“数据保存与备份”，分别说明本机存储、没有自动同步，以及换设备前下载文件、再恢复的步骤。提示消息使用支持检测后的 Popover，避免弹窗内的错误提示被遮挡。

图标使用内置图像生成工具制作（工具未提供可核验的具体模型名称），最终资源为 `public/save-money/icon-v2-192.png` 和 `public/save-money/icon-v2-512.png`。生成后仅转换为适合图标使用的不透明 PNG 并缩放。旧资源保留以兼容缓存；主页面、Manifest 和离线缓存改用新版资源。

生成提示词：

> Use case: logo-brand. Create one premium iOS app icon for a personal savings app named 一点点, no text anywhere. A single beautifully sculpted translucent emerald-green glass pebble/pocket containing one warm brushed-gold coin, simple iconic silhouette suggesting a small growing savings reserve. Sophisticated tactile 3D product render, generous optical padding, subtle caustic highlights, restrained luxury, readable at 48px. Full-bleed square deep forest green background #123c32, no outer border, no rounded-square container (OS applies mask), no phone mockup, no typography, no watermark, no clutter. Centered symbol occupies 65% of canvas. Square 1024x1024. Save output image for use as a website and iPhone home screen app icon.
