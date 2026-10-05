# Lucent Ripples · 一池清漾

使用 PixiJS 和 WebGL 制作的交互式鱼池，可在浏览器中运行，也可作为 Wallpaper Engine 网页动态壁纸。

优先适配电脑桌面，重点支持 1080p 和 2K 显示器；手机和平板提供基础自适应。

## 场景功能

- 手绘卡通与自然写实两种风格，支持窗口缩放、铺满和拖动浏览全景。卡通池底包含石头笔触、浅水层次及半透明鱼鳍。
- 鱼群巡游、荷叶遮挡、荷花生长，以及青蛙、小虾、螃蟹和飞行昆虫。
- 春季嫩绿、夏季繁盛、秋季枯黄、冬季半冻结；秋冬隐藏蜻蜓、蜜蜂、蝴蝶和萤火虫。
- 晴、阴、雨、雪、风与昼夜变化；雪仅在冬季显示，月夜预览包含缓慢移动的碎月光。
- 点击活水吸引附近鱼群。网页中空格暂停、F 切换全屏；窄屏可拖动查看完整池塘。
- 荷花生长进度保存在当前浏览器，关闭后继续计算真实经过时间。更换地址或清除浏览器数据会影响存档。

## 直接使用

下载仓库并解压，或通过 Git 获取：

```powershell
git clone --branch main https://github.com/shawns-yao/Lucent-Ripples.git
```

### 浏览器离线演示

打开 `artifacts/fish-pond.html`。图片和脚本已内嵌，无需安装 Node.js、启动服务或填写密钥。使用支持 WebGL 的现代浏览器。

### Wallpaper Engine 动态壁纸

需要安装 Wallpaper Engine。使用以下独立目录，不要把整个源码仓库导入编辑器：

```text
artifacts/wallpaper-engine/
├── index.html
├── project.json
└── preview.jpg
```

1. 打开 Wallpaper Engine 壁纸编辑器。
2. 将该目录内的 `index.html` 拖到 **Create Wallpaper / 创建壁纸**，按网页壁纸导入。
3. 在 Wallpaper Engine 内预览并应用壁纸，点击桌面右上角时间面板展开场景设置。
4. 需要发布到 Steam 创意工坊时，使用编辑器的 **Workshop → Share wallpaper on Workshop**。

`project.json` 保存项目类型和用户属性，不是网页入口。编辑器会复制导入目录；此后修改仓库文件不会自动更新编辑器副本。更新已发布壁纸时使用原来的编辑器项目，保留其 `workshopid`。

网页和壁纸右上角都有玻璃质感时间面板。时钟和日期每分钟更新；桌面同时显示季节、天气、当前鱼与荷花数量、水面状态和风力。离线天气标注“演示”，不显示虚构的实时温度、湿度或日落时间。点击面板展开设置，按 Esc 收起；小屏收起次要统计。

时间始终为电脑本地时间，不受白昼或月夜预览影响。壁纸模式保留此入口，隐藏网页暂停、全屏及真实天气查询区域；也可以在 Wallpaper Engine 的右侧属性栏调整设置。壁纸内临时选择不写回宿主配置，重新加载时以宿主属性为准。

导入后请确认属性面板包含下列设置；如果编辑器重新生成项目配置，可通过 **Edit → Change Project settings** 核对属性，配置来源为 `Config/wallpaper-engine.json`。不要用模板整体覆盖已发布项目的配置。

| 设置 | 可选范围 |
| --- | --- |
| 画面风格 | 卡通、自然写实 |
| 演示天气 | 晴、阴、雨、雪、风 |
| 昼夜 | 随时间、白昼预览、月夜预览 |
| 场景季节 | 随日期、春、夏、秋、冬 |
| 画面适配 | 铺满屏幕、完整池塘 |
| 帧率上限 | 30 帧、60 帧；默认 30 帧 |
| 鼠标互动与拖动 | 开启、关闭 |
| 鱼群数量 | 季节默认数量的 0%～100% |
| 特效强度 | 低、中、高；默认高 |
| 清晰度 | 均衡、高清（最高 2K）；默认高清 |

春夏秋冬默认分别显示 32、44、28、10 条鱼。鱼量设为 50% 时，分别显示 16、22、14、5 条；设为 0% 时隐藏鱼群。特效档位调整雨雪粒子数量、花粉、薄雾及水面高光，低档减少细节计算。自动性能降级仍然生效。

“清晰度”控制绘制像素，“特效强度”控制场景细节，二者独立。高清档最高按 2560×1440 绘制，均衡档像素预算约 260 万；慢帧时仍会自动降级。4K 显示器会按窗口适配，不按原生 4K 绘制。原始图像的纹理细节不会因提高分辨率自动增加。实际帧率还受设备性能与 Wallpaper Engine 全局帧率上限影响，壁纸支持宿主暂停和恢复。

此目录是可导入的 Web Wallpaper 项目，不是已发布的创意工坊条目，也不是安装程序。尚未在原生 Wallpaper Engine 内完成导入验收。

[官方网页壁纸导入说明](https://docs.wallpaperengine.io/en/web/first/gettingstarted.html) · [官方用户属性说明](https://docs.wallpaperengine.io/en/web/customization/properties.html)

## 运行源码

需要 Node.js 22.12 或更高版本。在项目根目录打开 PowerShell：

```powershell
npm.cmd ci
npm.cmd run dev
```

访问终端显示的地址，默认 `http://127.0.0.1:5173/`。不配置 `.env` 也能使用演示天气。

## 和风天气配置

真实天气仅用于带后端的网页模式。**离线 HTML 和 Wallpaper Engine 包使用演示天气，不会读取 `.env` 或调用和风天气。**

首次配置时，在项目根目录复制模板为 `.env`；已有 `.env` 时直接编辑，避免覆盖本地配置：

```powershell
Copy-Item .env.example .env
notepad .env
```

填写自己的 API Host，并选择一种认证方式：

```dotenv
QWEATHER_API_HOST=你的账户分配的主机名.qweatherapi.com
QWEATHER_API_KEY=
QWEATHER_JWT=
HOST=127.0.0.1
PORT=8787
```

- 使用 API Key：填写 `QWEATHER_API_KEY`，让 `QWEATHER_JWT` 保持为空。
- 使用 JWT：填写有效的 `QWEATHER_JWT`，让 `QWEATHER_API_KEY` 保持为空。项目不会替你签发令牌；过期后需要更新并重启后端。
- Host 只填写主机名，不添加 `https://` 或路径。两种凭据不能同时填写。

保留前端服务，在另一个 PowerShell 窗口进入项目根目录，运行：

```powershell
npm.cmd run weather
```

该命令读取根目录 `.env` 并启动本地天气后端。前端通过代理访问它；修改 `.env` 后需重启此后端，单独运行 `npm.cmd run dev` 不会启动天气服务。

如果 `.env` 文件不存在，天气启动命令会报错。如果文件存在但凭据为空，后端仍可启动，但真实天气查询不可用，接口返回 `503 / not_configured`；鱼池演示不受影响。凭据格式有效也不代表鉴权成功，仍需和风账户权限及网络正常。

配置后，在网页天气面板手动查找城市和区县，或点击“使用当地天气”并由你决定是否授予定位权限。默认不会请求定位；真实天气查询会发送粗略位置或地名到后端及和风天气，并使用你的账户额度。

`.env` 和本地环境文件不提交到 Git，也不放入分享包。仓库只保留空凭据模板；不要把密钥写入前端或 `VITE_` 变量。

## 文件位置

| 目录或文件 | 用途 |
| --- | --- |
| `src/` | 鱼池场景、动物动作、天气和壁纸适配 |
| `public/assets/` | 场景图像与纹理 |
| `Config/wallpaper-engine.json` | 壁纸属性配置 |
| `server/weather-server.mjs` | 和风天气后端 |
| `.env.example` | 本地天气配置模板 |
| `artifacts/` | 可直接使用的离线演示和壁纸项目 |
| `TODO.md` | 项目事项及进度记录 |
