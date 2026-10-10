import { compute, exploration, DEFAULTS } from './math.mjs';

const $ = id => document.getElementById(id);
const f = (x, digits = 4) => Number(x).toFixed(digits).replace(/\.?0+$/, '') || '0';
const pct = x => (x * 100).toFixed(2) + '%';
const signed = x => x < 0 ? `(${f(x)})` : f(x);
const sumText = xs => xs.map(signed).join(' + ');
const table = (headers, rows, highlight = -1) => `<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row, i) => `<tr${i === highlight ? ' class="highlight"' : ''}>${row.map((cell, j) => j ? `<td class="numeric">${cell}</td>` : `<th scope="row">${cell}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const equation = text => `<div class="equation compact">${text}</div>`;
const note = text => `<div class="takeaway">${text}</div>`;
const params = { ...DEFAULTS };
let step = 0;
const steps = [
  { label: '任务与动作', title: '先把一次决策拆开', lead: '智能体看到页面，提出候选动作，再按策略选择其中一个。策略就是每个动作被选择的概率。', source: '§3 / Figure 2 / Table 7 · pp.2–3、8', page: 8,
    render: d => `<div class="site-mock"><div class="mock-top">教学页面 / Shopping Admin</div><div class="mock-body"><div class="mock-menu"><span>Dashboard</span><span>Catalog</span><span class="chosen">Marketing</span><span>Search</span></div><div class="mock-main"><small>当前目标</small><b>找到指定商品的客户评价</b><p style="margin:12px 0 0;font-size:11px">菜单名称看起来相似，但历史后果不同。</p></div></div></div><p><b>状态 s</b>：当前页面及有效操作历史。<br><b>动作 a</b>：点击某个菜单。<br><b>策略 π(a|s)</b>：在此状态选择动作的概率。</p><div class="action-candidates">${d.actions.map(a => `<span>点击 ${a}</span>`).join('')}</div>${note('模型权重保持冻结。JitRL 改的是当前候选动作的分数与采样概率。这里先让三个动作都已有历史，探索分支放到理论部分单独展开。')}<details><summary>查看论文原始框架图</summary><img class="paper-figure" src="assets/figure2.png" alt="论文 Figure 2：检索情景记忆、估计优势、修正动作分数，以及回合结束后写回经验"><p>Figure 2（原论文截图）。教学案例把整个闭环拆成下面 10 个计算步骤。</p></details>` },
  { label: '奖励 → 回报', title: '即时奖励，要折算成整条后果', lead: '动作当下有多好叫奖励 r；从这个动作开始、把未来奖励折扣后相加，得到回报 G。', source: '§4.1 / Eq. (3) · p.3；奖励评分 pp.16–17', page: 3,
    render: d => { const h = d.records[2], g = params.gamma; return `<p>看历史轨迹 H3：第一步选择 Marketing，之后打开评价菜单并读到目标内容。教学奖励设为 [1, 2, 3]，不是原始实验日志。</p><div class="reward-path">${['点击 Marketing', '打开 Reviews', '读取目标评价'].map((a,i) => `<div class="reward-stop"><small>t = ${i}</small><b>${a}</b><strong>+${h.rewards[i]}</strong></div>`).join('')}</div>${equation('Gₜ = rₜ + γrₜ₊₁ + γ²rₜ₊₂ + …')}<div class="calc-line"><span class="label">从最后一步向前计算，γ = ${f(g)}</span>G₂ = 3<br>G₁ = 2 + ${f(g)} × 3 = <b>${f(h.returns[1])}</b><br>G₀ = 1 + ${f(g)} × 2 + ${f(g)}² × 3</div><div class="calc-result">G₀ = ${f(h.G)}</div>${note('γ 越小，越重视眼前奖励。真实算法可在回合结束后，让评估器回看轨迹并给每步打分，再计算 G；这里的数字已给定，便于手算。')}`; } },
  { label: '情景记忆', title: '记住状态、动作和回报', lead: '每条记忆都是 (s, a, G)。回合中后续状态也可以写入，但估值时只取与当前状态相近的记录。', source: '§4.1 · p.3；Algorithm 1 · p.26', page: 3,
    render: d => `<p>下面展示 ${d.n} 条与当前状态相近的起始记录。右侧改变 γ 时，网页用保留的原始奖励重算 G；只存 G 的真实记忆不会自动这样变化。</p>${table(['记录', '起始动作', '奖励序列', '起始回报 G'], d.records.map(h => [h.id, h.action, '[' + h.rewards.join(', ') + ']', f(h.G)]), params.includeNew ? 6 : -1)}${equation('M ← M ∪ {(sₜ, aₜ, Gₜ)}')}${note('同一个 Marketing 可以有不同回报，例如两次执行遇到不同页面情况。JitRL 用样本平均估计这个动作在邻域内的价值。')}` },
  { label: '状态与相似度', title: '先判断“以前见过类似局面吗”', lead: '不能把任何成功经验都拿来套用。WebArena 先按规整 URL 筛选同类页面，再用 Jaccard 比较有效状态。', source: 'Appendix F / Eq. (24) · pp.15–16', page: 15,
    render: d => `<p>教学版把当前页面压缩成 5 个离散特征：</p><div class="token-set">${d.currentTokens.map(t => `<span>${t}</span>`).join('')}</div>${equation('J(s, sᵢ) = |tokens(s) ∩ tokens(sᵢ)| / |tokens(s) ∪ tokens(sᵢ)|')}<div class="calc-line"><span class="label">H1：同样 5 个特征，再多一个 banner_visible</span>交集有 5 个，并集有 6 个<br>J(s,H1) = 5 / 6 = <b>0.8333</b></div><div class="calc-line"><span class="label">反例：将 no_modal 替换为 modal_open</span>交集有 4 个，并集有 6 个<br>J = 4 / 6 = <b>0.6667</b>，低于阈值 0.8</div>${note('这些 token 是教学简化。论文的网页状态采用正则化 URL 和有效动作历史；动作也要规范化并在当前页面重新绑定，不能直接复用易变化的元素编号。')}` },
  { label: '检索邻域', title: '保留相似度达标的历史', lead: '先用阈值过滤，再按相似度取最多 k 条。本例沿用 WebArena 的阈值 0.8、k=10。', source: 'Appendix F / Table 11 · pp.15、21', page: 15,
    render: d => `${table(['记录', '交集 / 并集', 'Jaccard', '是否保留'], d.records.map(h => [h.id + ' · ' + h.action, `${h.jaccard.intersection} / ${h.jaccard.union}`, f(h.jaccard.similarity), h.selected ? '✓ 保留' : '排除']))}<div class="calc-result">|N(s)| = ${d.n}</div><p>所有 ${d.n} 条都达到 0.8，且未超过 k=10。估值时对保留下来的记录<strong>等权平均</strong>，并不按相似度再加权。</p>${note('相似度决定“进不进邻域”；回报决定“动作有多好”。这两件事不要混淆。')}` },
  { label: '基座策略', title: '模型原来更想选什么？', lead: 'logit 是候选动作的未归一化分数。指数化并除以总和，就成为总和为 1 的概率。', source: '§4.3 / §5.1 · pp.4–5', page: 4,
    render: d => `${equation('π₀(a|s) = exp(z(a)) / ∑ᵦ exp(z(b))')}${table(['动作', '教学 logit z', 'exp(z)', '基座概率 π₀'], d.actions.map((a,i) => [a, f(d.z[i]), f(d.softmaxTerms.prior.rawExponents[i]), pct(d.prior[i])]), 0)}<div class="calc-line"><span class="label">以 Marketing 为例</span>分母 = ${d.softmaxTerms.prior.rawExponents.map(x => f(x)).join(' + ')} = ${f(d.softmaxTerms.prior.rawDenominator)}<br>π₀(M) = ${f(d.softmaxTerms.prior.rawExponents[1])} / ${f(d.softmaxTerms.prior.rawDenominator)} = <b>${pct(d.prior[1])}</b></div>${note('基座更偏向 Catalog，但仍有概率选择其他动作。本例直接指定 z=[0.9,0.7,0.4]；论文可读取候选索引的 logprob，或用模型显式给出的置信分作为代理。')}` },
  { label: '估计 V 与 Q', title: '整体平均，与动作自己的平均', lead: 'V 是邻域内所有记录的平均回报；Q 则只平均“选择了这个动作”的记录。', source: 'Eq. (4)–(5) · pp.3–4', page: 3,
    render: d => `${equation(`V(s) = (${sumText(d.records.map(h => h.G))}) / ${d.n} = ${f(d.V)}`)}${table(['动作', '该动作回报之和', '次数', 'Q = 和 / 次数'], d.actions.map((a,i) => [a, sumText(d.records.filter(h => h.action === a).map(h => h.G)), d.counts[i], f(d.Q[i])]), 1)}<div class="calc-line"><span class="label">Marketing 的价值估计</span>Q(M) = ${f(d.sums[1])} / ${d.counts[1]} = <b>${f(d.Q[1])}</b></div>${note(`V=${f(d.V)} 是按 ${d.n} 条记录平均，不是把三个动作的 Q 再简单平均。当各动作的样本数不同，这个区别尤其重要。`)}` },
  { label: '优势与归一化', title: '好多少？先减基线，再统一尺度', lead: '优势 A=Q−V，衡量动作比邻域平均好多少。论文实现再用最大绝对优势归一化。', source: 'Eq. (7)、(25) · pp.4、16', page: 16,
    render: d => `${table(['动作', 'Q', '− V', '优势 A'], d.actions.map((a,i) => [a, f(d.Q[i]), f(d.V), f(d.A[i])]), 1)}${equation(`M = max|A| = ${f(d.M)}<br>Ã(a) = A(a) / (M + ε)，ε = 10⁻⁸`)}${table(['动作', '归一化计算', 'Ã'], d.actions.map((a,i) => [a, `${f(d.A[i])} / (${f(d.M)} + ε)`, f(d.An[i])]), 1)}${note(params.normalize ? `当前使用归一化优势 Ã。Marketing 的优势为 ${f(d.An[1])}；正值提高分数，负值降低分数。` : '<b>当前关闭了归一化。</b>后续使用原始 A；同一个 β 的修正幅度会改变。正文公式与实现的这层差别应明确讲出。')}` },
  { label: '修正分数', title: '经验修正，加到原来的分数上', lead: 'β 控制这次有多相信历史。模型原来的偏好保留，经验作为一个加法项。', source: 'Eq. (10)、(25) · pp.4、16；Algorithm 1 · p.26', page: 4,
    render: d => `${equation(`z′(a) = z(a) + β${params.normalize ? 'Ã' : 'A'}(a)，β = ${f(params.beta)}`)}${table(['动作', '原分数 z', '经验修正', '新分数 z′'], d.actions.map((a,i) => [a, f(d.z[i]), `${f(params.beta)} × ${signed(d.appliedAdvantage[i])}<span class="subcell">= ${f(d.correction[i])}</span>`, f(d.zp[i])]), 1)}<div class="calc-line"><span class="label">Marketing</span>${f(d.z[1])} + ${signed(d.correction[1])} = <b>${f(d.zp[1])}</b></div>${note(params.beta === 0 ? '此刻 β=0，所有修正都为 0。新策略完全回到基座策略，可用来验证整条计算链。' : '拖动 β 观察结果：β 越大，对高优势动作越偏好。没有参数梯度更新；被改变的是这一次决策使用的候选分数。')}` },
  { label: '概率与采样', title: '把修正后的分数变成动作', lead: '再次做 Softmax，得到最终策略。概率最大的动作更常被选中，但采样并不等于永远取最大值。', source: 'Eq. (9)–(10) / Algorithm 1 · pp.4、26', page: 4,
    render: d => { const cum = [d.post[0], d.post[0]+d.post[1], 1], chosen = cum.findIndex(x => .5 < x); return `${table(['动作', 'z′', 'exp(z′)', '最终概率'], d.actions.map((a,i) => [a, f(d.zp[i]), f(d.softmaxTerms.post.rawExponents[i]), pct(d.post[i])]), 1)}<div class="calc-line"><span class="label">Marketing 的分子与分母</span>π(M) = ${f(d.softmaxTerms.post.rawExponents[1])} / ${f(d.softmaxTerms.post.rawDenominator)} = <b>${pct(d.post[1])}</b></div><div class="prob-wide" role="img" aria-label="${d.actions.map((a,i) => `${a} ${pct(d.post[i])}`).join('，')}">${d.actions.map((a,i) => `<span style="width:${d.post[i]*100}%">${d.post[i]>.15 ? a : ''}</span>`).join('')}</div><p class="source">按 Catalog → Marketing → Search 排列累计区间。</p><div class="calc-line"><span class="label">给定一次演示抽样 u=0.5（固定示例，不是随机重抽）</span>累计边界 [${cum.map(x => f(x)).join(', ')}]<br>0.5 落入 <b>${d.actions[chosen]}</b> 的区间，因此执行该动作。</div>${note(`此刻 Marketing 从 ${pct(d.prior[1])} 变为 ${pct(d.post[1])}。这是对当前记忆估值的反应；奖励误评、状态不相似或旧经验失效，都会影响结果。`)}`; } },
  { label: '写回与下一轮', title: '新经验回来，下一轮重新计算', lead: '假设执行 Marketing 后完成任务，评价器给出奖励 [2,3,3]。把每个状态的回报写入记忆，再回到类似起始状态做决策。', source: '§4.1 / Algorithm 1 · pp.3、26', page: 26,
    render: d => { const before = compute({...params,includeNew:false}), after = compute({...params,includeNew:true}), delta=after.post[1]-before.post[1]; return `${table(['状态与动作', 'r', 'G', '进入当前邻域？'], d.newTrajectory.steps.map((s,i) => [`s${i} · ${s.action}`, s.reward, f(s.G), s.entersCurrentNeighborhood ? '是，成为 H7' : '否，状态不同']), 0)}<p>新增 3 条记忆，但这里只增加 1 条起始状态邻居，所以 n 从 6 变为 7。</p>${table(['对照量', '加入前', '加入后'], [['Q(M)',f(before.Q[1]),f(after.Q[1])],['V',f(before.V),f(after.V)],['π(M)',pct(before.post[1]),pct(after.post[1])]],2)}<button type="button" class="inline-action" id="toggle-new-inline">${params.includeNew ? '移除这条新经验，回到 6 条邻居' : '把这条经验加入当前计算'}</button>${note(params.beta===0 ? '当前 β=0，经验修正关闭，加入新记忆也不会改变动作概率。' : Math.abs(delta)*100<0.005 ? '当前参数下，概率变化小于 0.01 个百分点。表格保留两位小数，看起来相同，但计算值仍有微小差异。' : delta<0 ? `成功经验加入后，Marketing 的概率反而下降 ${f(-delta*100,2)} 个百分点。Q 提升的同时，V 与归一化尺度也在改变；“成功一次”不保证该动作概率单调增加。` : `当前参数下，Marketing 概率增加 ${f(delta*100,2)} 个百分点。变化由当前参数和各动作相对价值决定；开启归一化时，V 还会通过缩放常数影响结果。`)}`; } }
];

function renderStage(d) {
  const s = steps[step];
  $('stage-count').textContent = `${String(step+1).padStart(2,'0')} / ${steps.length}`;
  $('stage-title').textContent = s.title;
  $('stage-lead').textContent = s.lead;
  $('stage-content').innerHTML = s.render(d);
  $('stage-source').textContent = s.source + ' ↗';
  $('stage-source').href = `https://arxiv.org/pdf/2601.18510v4#page=${s.page}`;
  $('prev').disabled = step === 0;
  $('next').disabled = step === steps.length-1;
  $('next').textContent = step === steps.length-1 ? '已到最后' : '下一步 →';
  document.querySelectorAll('#step-nav button').forEach((b,i) => {
    if (i === step) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
  });
  $('toggle-new-inline')?.addEventListener('click', () => { params.includeNew=!params.includeNew; $('new-memory').checked=params.includeNew; render(); });
}
function renderObjective(d) {
  const u=d.appliedAdvantage, expected=p=>p.reduce((s,x,i)=>s+x*u[i],0);
  const e0=expected(d.prior), e1=expected(d.post);
  const kl=d.post.reduce((s,p,i)=>s+p*Math.log(p/d.prior[i]),0);
  $('objective-table').innerHTML=params.beta===0
    ? '<p>β=0 时，1/β 的写法无定义。取 β→0⁺ 的极限，最优策略回到 π₀。</p><div class="objective-row"><span>此刻策略</span><b>完全等于基座</b></div>'
    : `<p class="fineprint">本次使用 ${params.normalize?'归一化优势 Ã':'原始优势 A'}，β=${f(params.beta)}</p><div class="objective-row"><span>基座 E[u]（KL=0）</span><span>${f(e0)}</span></div><div class="objective-row"><span>修正后 E[u]</span><span>${f(e1)}</span></div><div class="objective-row"><span>KL(p ‖ π₀)</span><span>${f(kl)}</span></div><div class="objective-row"><span>修正后目标 E[u] − KL/β</span><span>${f(e1-kl/params.beta)}</span></div><div class="objective-row"><span>目标改善</span><span class="objective-total">+${f(Math.max(0,e1-kl/params.beta-e0))}</span></div>`;
  const e=exploration(params);
  $('exploration-table').innerHTML=equation(`乐观分支 Q(Help) = V + α/n = ${f(e.V)} + 5/${e.n} = ${f(e.optimistic.Q[3])}`)+table(['Help 的计算','乐观分支（5%）','常规分支（95%）'],[
    ['Q',f(e.optimistic.Q[3]),'0'],['A=Q−V',f(e.optimistic.A[3]),f(e.neutral.A[3])],['该分支 max|A|',f(e.optimistic.M),f(e.neutral.M)],
    [params.normalize?'使用 Ã':'使用原始 A',f(e.optimistic.appliedAdvantage[3]),f(e.neutral.appliedAdvantage[3])],['z′=0.2+βu',f(e.optimistic.zp[3]),f(e.neutral.zp[3])],['π(Help)',pct(e.optimistic.post[3]),pct(e.neutral.post[3])]
  ],5)+`<p>对两种分支求平均，P(Help)=0.05×${pct(e.optimistic.post[3])}+0.95×${pct(e.neutral.post[3])}=<b>${pct(e.mixture[3])}</b>。不能先平均 Q 再做 Softmax。</p>`;
}
function render() {
  const d=compute(params);
  $('beta-output').value=params.beta.toFixed(2);
  $('gamma-output').value=params.gamma.toFixed(2);
  $('probability-bars').innerHTML=d.actions.map((a,i)=>`<div class="prob-row"><div class="prob-heading"><span>${a}</span><strong>${pct(d.post[i])}</strong></div><div class="prob-base" title="基座 ${pct(d.prior[i])}"><span style="width:${d.prior[i]*100}%"></span></div><div class="prob-new" title="修正后 ${pct(d.post[i])}"><span style="width:${d.post[i]*100}%"></span></div></div>`).join('');
  $('memory-status').textContent=`${d.n} 条邻居 · V = ${f(d.V)} · ${params.normalize?'归一化优势':'原始优势'} · β = ${f(params.beta)}`;
  renderStage(d); renderObjective(d);
}
$('step-nav').innerHTML=steps.map((s,i)=>`<button type="button" data-step="${i}"><span class="num">${String(i+1).padStart(2,'0')}</span>${s.label}</button>`).join('');
$('step-nav').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b){step=Number(b.dataset.step);render();}});
$('step-nav').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();step=e.key==='Home'?0:e.key==='End'?steps.length-1:Math.max(0,Math.min(steps.length-1,step+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)));render();$('step-nav').children[step].focus();});
$('prev').addEventListener('click',()=>{step=Math.max(0,step-1);render();});
$('next').addEventListener('click',()=>{step=Math.min(steps.length-1,step+1);render();});
['beta','gamma'].forEach(key=>$(key).addEventListener('input',()=>{params[key]=Number($(key).value);render();}));
$('normalize').addEventListener('change',()=>{params.normalize=$('normalize').checked;render();});
$('new-memory').addEventListener('change',()=>{params.includeNew=$('new-memory').checked;render();});
$('reset').addEventListener('click',()=>{Object.assign(params,DEFAULTS);$('beta').value=params.beta;$('gamma').value=params.gamma;$('normalize').checked=params.normalize;$('new-memory').checked=params.includeNew;render();});

const paper=(label,page)=>`<a href="https://arxiv.org/pdf/2601.18510v4#page=${page}" target="_blank" rel="noreferrer">${label} ↗</a>`;
const results={
  main:()=>table(['同一 Gemini-2.5-flash','Avg','Final'],[['Static','35.63%','36.30%'],['Memory','41.36%','43.00%'],['Reflexion','41.08%','42.12%'],['AWM','39.37%','40.32%'],['EvoTest','39.24%','42.49%'],['JitRL','46.98%','51.35%']],5)+`<div class="result-copy"><div class="result-number">+15.05<small> 个百分点</small></div><h3>最终轮成功率的提升</h3><p>相对 Static；相对这些基线中 Final 最好的 Memory，仍提高 8.35 个百分点。两者均为同一基座下的对照。</p><p>Avg 与 Final 是按任务数量汇总的成功率，不是给每个子站点同等权重。</p><p class="source">${paper('Table 1 · p.6',6)}</p></div>`,
  controlled:()=>table(['比较条件（Final）','JitRL','WebRL'],[['主表：不同底座与适配方式<span class="subcell">JitRL：Gemini-2.5-flash；WebRL：Llama-3.1-70B</span>','60.00%','46.06%'],['同 Llama-3.1-8B，在线各尝试 5 次<span class="subcell">Appendix I / Table 12</span>','32.97%','27.27%'],['同 Llama-3.1-70B，测试期冻结适配<span class="subcell">Appendix J.1 / Table 13</span>','40.88%','46.06%']])+`<div class="result-copy"><div class="result-number">条件<small> 决定比较含义</small></div><h3>不能笼统说“超过训练”</h3><p>主表对比同时包含底座和在线适配差异。补充对照中，JitRL 在同 8B 的在线设置总体较好，但并非各网站都领先。</p><p>同 70B 对照使用相同训练任务，在 165 个 held-out 任务上均不做测试期适配；此时 JitRL 低于 WebRL。</p><p class="source">${paper('Table 2 · p.6',6)}；${paper('Table 12 · p.21',21)}；${paper('Table 13 · p.22',22)}</p></div>`,
  ablation:()=>table(['问题','对照','JitRL'],[['同样记忆拼进提示还是修正 logit？<span class="subcell">Admin / 成功率</span>','48.35%<span class="subcell">Prompt Update</span>','52.31%'],['同一消融，在 Reddit<span class="subcell">成功率</span>','54.57%<span class="subcell">Prompt Update</span>','57.64%'],['新任务也能受益吗？<span class="subcell">Shopping / Avg；仅检索其他任务</span>','23.44%<span class="subcell">Static</span>','36.98%']])+`<div class="result-copy"><div class="result-number">+3.96<small> / +3.07 个百分点</small></div><h3>显式修正有额外收益</h3><p>保持检索记忆相同，直接改 logit 优于把记忆拼进提示。Table 8 未单列 Avg / Final；其 JitRL 数值对应主表 Avg，不能标成 Final。</p><p>Table 5 的跨任务结果使用其他任务的记忆，显示一定迁移价值；它不是无记忆的零样本结果。</p><p class="source">${paper('Table 8 / §5.6 · p.8',8)}；${paper('Table 5 · p.7',7)}</p></div>`,
  cost:()=>table(['论文成本估算','金额','口径'],[['Static','$200','推理 API'],['JitRL','$290','推理 API'],['WebRL','约 $9,900','GPU 训练']])+`<div class="result-copy"><div class="result-number">1.45<small> × Static</small></div><h3>省掉训练，仍有推理开销</h3><p>JitRL / Static = 290/200 = 1.45。相对表内 WebRL 训练金额，9,900/290 ≈ 34.1。</p><p>后一比值比较了不同成本口径，不能当成相同生命周期、相同基座下的严格降本倍数，也不是当前 API 报价。</p><p class="source">${paper('Table 9 · p.8',8)}；${paper('Appendix P · pp.23–24',23)}</p></div>`
};
function showResult(key,focus=false){$('results-panel').innerHTML=results[key]();$('results-panel').setAttribute('aria-labelledby','tab-'+key);document.querySelectorAll('[data-result]').forEach(b=>{const active=b.dataset.result===key;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active&&focus)b.focus();});}
document.querySelectorAll('[data-result]').forEach(b=>b.addEventListener('click',()=>showResult(b.dataset.result)));
document.querySelector('.evidence-tabs').addEventListener('keydown',e=>{const keys=Object.keys(results);const i=keys.indexOf(e.target.dataset.result);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showResult(keys[e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowRight'?1:keys.length-1))%keys.length],true);});

const topics=[
  ['basics','任务背景与基础概念','状态、动作、策略、奖励、回报；为什么不更新参数也能学习','4 分钟',4,true],
  ['calculation','完整手算案例','记忆 → 检索 → V/Q → 优势 → logit → Softmax','12 分钟',12,true],
  ['next','新经验与下一轮','写回后重算；成功经验为何不保证概率单调上升','3 分钟',3,true],
  ['theory','KL 正则化直觉','为什么是加法修正；推导可放附录','3 分钟',3,true],
  ['evidence','主结果与公平对照','同基座结果、WebRL 对照与实验口径','4 分钟',4,true],
  ['limits','局限与讨论','相似度、评估偏差、固定 k 与理论假设','4 分钟',4,true],
  ['explore','未见动作的探索','两个分支、乐观奖励与最终执行概率','附录',0,false],
  ['extras','更多实验与复现细节','消融、跨任务、成本及 v4 文本差异','附录',0,false]
];
let selections=new Set(topics.filter(x=>x[5]).map(x=>x[0]));
const storageKey='jitrl-walkthrough-outline-v1';
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&Array.isArray(saved.selected))selections=new Set(saved.selected.filter(id=>topics.some(t=>t[0]===id)));if(saved&&typeof saved.notes==='string')$('discussion-notes').value=saved.notes;}catch{}
$('outline-options').innerHTML=topics.map(([id,title,desc,time])=>`<label class="outline-option"><input type="checkbox" data-topic="${id}" ${selections.has(id)?'checked':''}><span><b>${title}</b><small>${desc}</small></span><em>${time}</em></label>`).join('');
function saveOutline(){try{localStorage.setItem(storageKey,JSON.stringify({selected:[...selections],notes:$('discussion-notes').value}));}catch{}}
function renderOutline(){const chosen=topics.filter(t=>selections.has(t[0]));const mins=chosen.reduce((s,t)=>s+t[4],0);$('outline-count').textContent=`${chosen.length} 个主题 · 约 ${mins} 分钟`;$('outline-selected').innerHTML=chosen.length?chosen.map(t=>`<li>${t[1]}${t[4]?'':'（附录）'}</li>`).join(''):'<li>还未选择内容</li>';}
$('outline-options').addEventListener('change',e=>{const id=e.target.dataset.topic;if(!id)return;e.target.checked?selections.add(id):selections.delete(id);saveOutline();renderOutline();});
$('discussion-notes').addEventListener('input',saveOutline);
function discussionText(){return ['JitRL 组会 PPT 讨论清单','论文：arXiv:2601.18510v4','目标：30 分钟，基础概念讲清楚','','保留内容：',...topics.filter(t=>selections.has(t[0])).map(t=>`- ${t[1]}（${t[3]}）`),'',`当前案例参数：β=${params.beta}，γ=${params.gamma}；${params.normalize?'归一化优势':'原始优势'}；${params.includeNew?'含新成功经验':'6 条原始邻居'}`,'','希望调整：',$('discussion-notes').value.trim()||'暂无补充','', '教学案例数据为构造示例，论文实验结果另行引用。'].join('\n');}
$('copy-outline').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(discussionText());$('copy-status').textContent='已复制。粘贴回聊天后，我们按这份清单修改。';}catch{$('copy-status').textContent='浏览器未允许复制，请点击“下载清单”保存文本。';}});
$('download-outline').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['\uFEFF'+discussionText()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='JitRL_PPT讨论清单.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('copy-status').textContent='已生成讨论清单文本，可将内容粘贴回聊天。';});
render();showResult('main');renderOutline();
