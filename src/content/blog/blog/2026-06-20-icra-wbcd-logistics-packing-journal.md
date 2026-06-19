---
title: ICRA WBCD 随记：我们在 Logistics Packing 拿到全球第一名的几天
date: 2026-06-20
summary: 到现场、跑通遥操作、凌晨三点调试、领奖。技术报告以后再写，这篇只记我们在 ICRA WBCD Logistics Packing 赛道拿到全球第一名那几天里留下来的画面。
tags:
  - icra
  - wbcd
  - robotics
  - competition
  - journal
category: embodied-ai
cover_image: /images/WBCD/wbcd-backdrop-casual-snapshot.jpeg
cover_fit: cover
cover_alt: ICRA WBCD event backdrop with What Bimanuals Can Do text
featured_slot: 2
draft: false
---

结果先放在前面：我们拿到了 ICRA WBCD Logistics Packing 赛道全球第一名。

WBCD 的全称是 What Bimanuals Can Do，是 ICRA 相关的双臂机器人挑战赛。它不是评一个统一的总冠军，而是不同赛道各自排名；我们参加的是 Logistics Packing，也就是物流包装这个赛道。

这个 blog 是一个简单的记录，技术报告我们目前正在努力推进。现在回头想，那几天留在脑子里的反而是一些很散的画面：进场时拍歪的背景板，桌上乱七八糟的线，凌晨三点还亮着的屏幕，还有最后拿到奖状时那种有点不真实的感觉。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-backdrop-casual-snapshot.jpeg" alt="ICRA WBCD event backdrop with What Bimanuals Can Do text" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">刚到现场时拍的背景板。</figcaption>
</figure>

刚进场看到这面背景板的时候，比赛这件事才突然落地。前面很长时间都在对着代码、数据、设备和各种临时问题，嘴上说是在准备比赛，但身体其实还没有进入现场。看到 ICRA、WBCD、What Bimanuals Can Do 这些字贴在一整面墙上，才意识到这次不是在实验室里继续调一个项目，而是真的把东西搬到了比赛场地。

主舞台附近也是我随手拍的。照片里有机器人展示，也有线缆、电源和一些没来得及整理的东西。它不像正式宣传照，但这正好是现场的样子：大家都在自己的区域里忙，展示、调试、比赛混在一块。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-main-stage-casual-snapshot.jpeg" alt="ICRA WBCD main stage and robot showcase area" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">主舞台附近。</figcaption>
</figure>

中间也逛了逛别的机器人。AGILE-X 的双臂平台摆在桌上，旁边是线缆、电源、任务物体，看起来一点也不“展品化”。我当时拍它不是为了做什么技术对比，只是觉得这种状态很像真实的机器人现场：东西能不能跑，往往就卡在这些很具体的桌面和线缆里。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-visit-agilex-dual-arm-platform.jpeg" alt="AGILE-X dual-arm tabletop platform at ICRA WBCD" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">AGILE-X 双臂平台。</figcaption>
</figure>

还有一个挂在支架上的大名鼎鼎的宇树人形机器人。它没有摆出一个很完整的展示姿态，反而像是刚从调试中停下来。支架、货架、工具、任务物体都在画面里。我挺喜欢这种照片，这是我第一次见到宇数的机器人，也是第一次见到它过后动起来。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-visit-humanoid-lift-frame-setup.jpeg" alt="Humanoid robot mounted on a lift frame during the ICRA WBCD visit" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">支架上的人形机器人。</figcaption>
</figure>

我们自己这边，最早让我心里稍微稳一点的，是第一次把遥操作跑通，我们用遥操作来采集的数据。

现在看这段视频，它其实很普通，就是一个小demo记录一下：手里握着控制器，前面是双臂平台，旁边围着遮光布。没有什么漂亮的动作，也没有最终比赛时那种紧张感。但当时它很关键。因为在那之前，设备是设备，程序是程序，数据是数据，很多东西还只是分开的模块。第一次真的控制起来以后，至少说明它们开始接上了。

<figure style="margin: 2rem 0;">
  <video controls preload="metadata" src="/images/WBCD/wbcd-first-teleoperation-success.mov" aria-label="Our team's first successful teleoperation run at ICRA WBCD"></video>
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">第一次跑通遥操作。</figcaption>
</figure>

跑通以后也没有突然变轻松。后面更多时间是在采数据、看状态、改设置、再采一批。工作站这张照片大概就是那几天的样子：屏幕上开着代码和终端，桌上有相机、线缆、水、零食，旁边还围着遮光布。它不整洁，但很真实。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-training-data-collection-workstation.jpeg" alt="Our training data collection workstation at ICRA WBCD" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">采集训练数据的工作站。</figcaption>
</figure>

我现在看到这张图，还是有一点成就感，也有一点小累说实话：坐下，看一眼结果，站起来调整设备，再坐下。很多时候没有大问题，就是一堆小问题排着队等你处理。

赛前有一天凌晨三点，我在现场走了一圈，拍了下面这段视频。

<figure style="margin: 2rem 0;">
  <video controls preload="metadata" src="/images/WBCD/wbcd-3am-pre-competition-debugging-walkthrough.mov" aria-label="3 AM pre-competition debugging walkthrough at ICRA WBCD"></video>
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">赛前凌晨三点。</figcaption>
</figure>

那时候很多队伍还没走。有人盯着屏幕，有人整理桌面，有人还在处理线缆。那个时间点已经没有什么“比赛氛围”了，更像所有人都在和自己的设备耗着，说苦好像也叫不上苦，只是感慨一下第一次通宵调设备。


现场也不只有我们的赛道。我拍了几段别的队伍和别的赛道的片段，单纯当记录，不是我们组的成果。

下面这个是别的队伍处理衣物。站在现场看这类任务，会比读任务名字直观得多。衣服这种东西只要动起来，柔性操作的很多麻烦就展现出来了。

<figure style="margin: 2rem 0;">
  <video controls preload="metadata" src="/images/WBCD/wbcd-other-team-clothes-hanging-demo.mov" aria-label="Another team's robot clothes handling demo at ICRA WBCD"></video>
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">别的队伍处理衣物。</figcaption>
</figure>

还有一段是别的队伍比赛现场。画面里机器人、盒子、桌面、围观的人和工作人员挤在很近的距离里。我当时只是觉得，这比很多正式照片更像比赛现场。

<figure style="margin: 2rem 0;">
  <video controls preload="metadata" src="/images/WBCD/wbcd-other-team-logistics-packing-match.mov" aria-label="Another team's competition scene at ICRA WBCD"></video>
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">别的队伍比赛现场。</figcaption>
</figure>

参赛证也拍了一张。前景其实有点糊，但后面正好能看到 Logistics Packing 的赛题牌和标记板。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-competition-badge-and-markers.jpeg" alt="ICRA WBCD competition badge and logistics packing marker sheets" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">参赛证和标记板。</figcaption>
</figure>

最后拿到奖状的时候，反而没有想象中那么立刻兴奋。可能是前面几天太满了，脑子里还停在“刚才那个问题怎么解决”“设备状态稳不稳”这些事情上。等到看到 Logistics Packing 赛道全球第一写在奖状上，才慢慢反应过来：这几天真的结束了，而且结果很好。

奖品是总价值超过 1 万美元的多个星海图机械臂。写出来还是有点不真实。前面大部分时间并不是在想“拿第一”，更多是在想眼前这个小问题能不能先过掉。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-global-first-place-certificate.jpeg" alt="ICRA WBCD Logistics Packing global first place certificate" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">Logistics Packing 赛道第一名奖状。</figcaption>
</figure>

颁奖时还拍了一张 Xu Zhuo 老师的汇报标题页。现场我没有记太多笔记，只记得那几天一直在处理很具体的问题：相机、夹爪、桌面、物体、规则、时间。最后又听到 Physical Intelligence 这样的题目，会有一种很奇怪的拉远感。

<figure style="margin: 2rem 0;">
  <img src="/images/WBCD/wbcd-award-ceremony-zhuo-xu-deepmind-talk.jpeg" alt="Zhuo Xu Google DeepMind talk slide during the ICRA WBCD award ceremony" style="width: 100%; border-radius: 1rem;" />
  <figcaption style="font-family: var(--sans); font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin-top: 0.55rem;">Xu Zhuo 老师汇报标题页。</figcaption>
</figure>

先记到这里。技术报告以后再写，这篇就留给现场本身。
