# FactorMiner 年度滚动最终报告

快照：2026-10-03 02:51:46 UTC。DeepSeek 授权范围 516 格已全部终结：395 valid、68 failed、12 partial、41 empty。GLM 303 未开始格为用户永久排除；全矩阵仍保留 1032 格。

主比较 M3−M2：52 个完整配对、12 个测试年份，年度净收益配对均差 +0.007892 个百分点，年份等权差 −1.246122 个百分点。M3 failed/终结 = 65/129。只对双方 valid 且 EVALUATED 的单元计算增量，缺失不补零。

## 展示

模型、股票池、年份、处理对比、指标及共同样本筛选；逐格记录、年度差异矩阵、0/5/10/20 bps 成本敏感性、完整失败分母，以及独立 V2 优化建议。年度账户独立，属于回溯研究。

`data.js` 与 `snapshot.json` 为同一公开快照，`units.csv` 保留完整 1032 格，`paired_differences.csv` 为原始报告的配对表，`paired_analysis.json` 为按配对和年份等权的复算；`provenance.json` 记录来源文件哈希。公开数据仅包括研究指标、分组编号、分类状态及校验值。

GitHub Pages 从 main 根目录发布，本报告路径为 `/rolling/`。根路径继续保留单年报告，并提供最终报告入口。
