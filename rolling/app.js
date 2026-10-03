(() => {
  'use strict';
  const {units,meta}=window.RESEARCH, {finite,mean,valid,years,select,pairs,delta}=window.ResearchMath;
  const $=id=>document.getElementById(id), pools=['ALL','C26','C35','C39'], arms=['M0','M1','M2','M3'];
  const names={ALL:'样本全市场',C26:'化工',C35:'专用设备',C39:'电子通信'};
  const statusNames={valid:'有效',failed:'失败',partial:'部分完成',empty:'空组合',incompatible:'不兼容',running:'运行中',not_started:'未开始',blocked:'阻塞',data_not_applicable:'不适用'};
  const colors={valid:'#16867d',failed:'#b66e4c',partial:'#cfb575',empty:'#8295a3',incompatible:'#735f80',running:'#3e8bc0',not_started:'#e0e6e8'};
  const armColors=['#244758','#4b84aa','#b07746','#16867d'];
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=2,scale=1,signed=false)=>finite(v)?(signed&&v>0?'+':'')+(v*scale).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const pct=v=>num(v,2,100);
  const signed=(v,d=2,scale=1)=>`<span class="${!finite(v)?'na':v>=0?'pos':'neg'}">${num(v,d,scale,true)}</span>`;
  const avg=(rs,k)=>mean(rs.map(r=>r[k]));
  const percentMetric=k=>!['rank_ic','rank_icir','sharpe'].includes(k);
  const value=(v,k)=>num(v,k==='rank_ic'?5:k==='rank_icir'?3:2,percentMetric(k)?100:1,true);
  const state=()=>({model:$('model').value,pool:$('pool').value,year:$('year').value,contrast:$('contrast').value,common:$('sample').value==='four'});
  const count=(rs,status)=>rs.filter(r=>r.execution_status===status).length;
  const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const row=cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
  const ds=units.filter(u=>u.model==='deepseek'), dsc=meta.by_model.deepseek;
  const mainPairs=pairs(units), mainNet=mean(mainPairs.map(p=>delta(p,'net_cumulative_return'))), mainIC=mean(mainPairs.map(p=>delta(p,'rank_ic')));
  const mainYearEqual=mean([...new Set(mainPairs.map(p=>p.test_year))].map(y=>mean(mainPairs.filter(p=>p.test_year===y).map(p=>delta(p,'net_cumulative_return')))));
  const m3=ds.filter(u=>u.arm==='M3'),m3Failures=count(m3,'failed');
  const positivePools=pools.filter(pool=>mean(mainPairs.filter(p=>p.industry===pool).map(p=>delta(p,'net_cumulative_return')))>0).length;
  $('as-of').textContent=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date(meta.as_of));
  $('hero-reading').textContent=`DeepSeek 的 M3−M2 当前有 ${mainPairs.length} 对完整结果，覆盖 ${years(mainPairs)} 个独立测试年份。年度净收益平均差 ${num(mainNet,3,100,true)} 个百分点；signed RankIC 差 ${num(mainIC,5,1,true)}。`;
  $('kpis').innerHTML=[['有效评价',`${dsc.valid} <small>/ 516</small>`,'DeepSeek 当前执行范围'],['已终结',`${516-dsc.not_started-dsc.running} <small>格</small>`,'包含失败、部分完成和空组合'],['运行 / 等待',`${dsc.running} <small>/ ${dsc.not_started}</small>`,'快照状态，不是实时计数'],['摘要增量配对',`${mainPairs.length} <small>对</small>`,`${years(mainPairs)} 个独立测试年份`]].map(x=>`<div class="kpi"><span>${x[0]}</span><strong>${x[1]}</strong><p>${x[2]}</p></div>`).join('');
  for(let y=2009;y<=2024;y++) $('year').add(new Option(y,y));

  function renderGroups(){
    const s=state(), filtered=select(units,s.model,s.pool,s.year), evaluated=filtered.filter(valid);
    $('filter-summary').textContent=`${evaluated.length} / ${filtered.length} 格有效 · ${years(evaluated)} 个有效年份`;
    let html='';
    for(const pool of pools) for(const arm of arms){
      const all=filtered.filter(u=>u.industry===pool&&u.arm===arm), rs=all.filter(valid);
      if(!all.length) continue;
      html+=row([`<button class="row-link" data-pool="${pool}" data-arm="${arm}">${pool}<span class="arm">${arm}</span></button>`,`${rs.length} / ${all.length}`,years(rs),num(avg(rs,'rank_ic'),4),num(avg(rs,'rank_icir'),3),pct(avg(rs,'gross_cumulative_return')),pct(avg(rs,'net_cumulative_return')),signed(avg(rs,'excess_cagr'),2,100),num(avg(rs,'sharpe')),pct(avg(rs,'max_drawdown')),pct(avg(rs,'turnover_two_sided_daily_mean'))]);
    }
    $('group-body').innerHTML=html || '<tr><td colspan="11" class="empty">此股票池在该年份没有设计格。</td></tr>';
    document.querySelectorAll('.row-link').forEach(b=>b.addEventListener('click',()=>showDetail(s.model,b.dataset.pool,b.dataset.arm,s.year)));
  }
  function showDetail(model,pool,arm,year){
    const rs=select(units,model,pool,year).filter(u=>u.arm===arm).sort((a,b)=>a.test_year-b.test_year||a.repeat-b.repeat);
    $('detail-title').textContent=`${model==='deepseek'?'DeepSeek Flash':'GLM 5.3'} / ${pool} / ${arm}`;
    $('detail-content').innerHTML=table(['测试年','重复','状态','signed IC','ICIR','净收益 %','超额 pp','请求数','说明'],rs.map(u=>row([u.test_year,u.repeat,statusNames[u.execution_status]||esc(u.execution_status),valid(u)?num(u.rank_ic,4):'—',valid(u)?num(u.rank_icir,3):'—',valid(u)?pct(u.net_cumulative_return):'—',valid(u)?signed(u.excess_cagr,2,100):'—',num(u.request_count,0),esc(u.reason_group)])));
    $('detail').showModal();
  }
  function renderPairs(){
    const s=state(), k=$('metric').value, ps=pairs(units,s), measured=ps.filter(p=>finite(delta(p,k))), v=mean(measured.map(p=>delta(p,k))), scale=percentMetric(k)?100:1;
    $('pair-kpis').innerHTML=[[measured.length,'指标完整配对'],[years(measured),'独立测试年份'],[value(v,k),`平均差值${percentMetric(k)?' / pp':''}`],[`${measured.filter(p=>delta(p,k)>0).length} / ${measured.length}`,'正差值配对（不代表显著）']].map(x=>`<div><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    $('pair-title').textContent=`${s.contrast} · ${$('metric').selectedOptions[0].text}`;
    const gs=pools.filter(p=>s.pool==='all'||p===s.pool).map(pool=>{const r=measured.filter(p=>p.industry===pool);return{pool,n:r.length,years:years(r),v:mean(r.map(p=>delta(p,k)))}});
    const extent=Math.max(...gs.map(g=>finite(g.v)?Math.abs(g.v):0),0.00001)*1.18, center=380, half=205, h=gs.length*58+52;
    let svg=`<svg viewBox="0 0 780 ${h}" role="img" aria-label="${esc($('pair-title').textContent)}，分股票池均值"><line x1="${center}" x2="${center}" y1="6" y2="${h-34}" stroke="#85979e" stroke-dasharray="3 3"/>`;
    gs.forEach((g,i)=>{const y=i*58+28, w=finite(g.v)?Math.abs(g.v)/extent*half:0, x=g.v<0?center-w:center;
      svg+=`<text x="10" y="${y}" fill="#203646" font-size="14" font-weight="650">${g.pool} · ${names[g.pool]}</text><rect x="${x}" y="${y-14}" width="${w}" height="21" rx="2" fill="${g.v>=0?'#16867d':'#b66e4c'}"><title>${g.pool}：${value(g.v,k)}，n=${g.n}，${g.years} 年</title></rect><text x="635" y="${y}" fill="#203646" font-size="14" text-anchor="end">${value(g.v,k)}</text><text x="770" y="${y}" fill="#65737d" font-size="12" text-anchor="end">n=${g.n} / ${g.years} 年</text>`;
    });
    svg+=`<text x="${center}" y="${h-10}" fill="#65737d" font-size="12" text-anchor="middle">0</text><text x="${center-half}" y="${h-10}" fill="#65737d" font-size="12" text-anchor="middle">${num(-extent,percentMetric(k)?2:4,scale)}</text><text x="${center+half}" y="${h-10}" fill="#65737d" font-size="12" text-anchor="middle">${num(extent,percentMetric(k)?2:4,scale)}</text></svg>`;
    const compact=gs.map(g=>`<div><strong>${g.pool} · ${names[g.pool]}</strong><b class="${!finite(g.v)?'na':g.v>=0?'pos':'neg'}">${value(g.v,k)}</b><small>n=${g.n} · ${g.years} 个测试年份</small></div>`).join('');
    $('pair-chart').innerHTML=measured.length?svg+`<div class="compact-pairs">${compact}</div>`:'<p class="empty">当前筛选下没有双方有效的完整配对。</p>';
    const yearEqual=mean([...new Set(measured.map(p=>p.test_year))].map(y=>mean(measured.filter(p=>p.test_year===y).map(p=>delta(p,k)))));
    $('pair-caption').textContent=`条形为配对等权的算术均值；先在年内平均、再让各年等权的当前指标差为 ${value(yearEqual,k)}${percentMetric(k)?' pp':''}。两者均为描述统计，不是置信区间。${s.contrast==='Flash-GLM'?'Flash−GLM 匹配同池、同年、同组、同重复；比较模型与推理设置整体差异，不归因为纯模型效应。':'每格按同模型、同池、同年、同重复编号匹配。'} 当前筛选下共有 ${ps.length} 对，其中 ${measured.length} 对具有该指标；缺失不补零。`;
    const usage=ps.filter(p=>p.left.unknown_usage_requests===0&&p.right.unknown_usage_requests===0&&finite(p.left.total_tokens)&&finite(p.right.total_tokens));
    const requests=mean(ps.map(p=>delta(p,'request_count'))),tokens=mean(usage.map(p=>delta(p,'total_tokens')));
    $('resource-reading').textContent=ps.length?`当前 ${s.contrast}：可比请求差平均 ${num(requests,2,1,true)} 次 / 格；usage 完整的 ${usage.length} 对中，token 差平均 ${num(tokens,0,1,true)}。未知 usage 保持未知。M3 的计划预算比 M2 每格多 9 次摘要调用。`:'当前没有完整配对，不能计算资源增量。M3 的计划预算比 M2 每格多 9 次摘要调用。';
    const visiblePools=pools.filter(p=>s.pool==='all'||s.pool===p), ys=s.year==='all'?Array.from({length:16},(_,i)=>2009+i):[Number(s.year)];
    $('year-matrix').innerHTML=table(['测试年份',...visiblePools.map(p=>`${p} · ${names[p]}`)],ys.map(year=>`<tr><td>${year}</td>${visiblePools.map(pool=>{const r=measured.filter(p=>p.industry===pool&&p.test_year===year),v=mean(r.map(p=>delta(p,k)));return `<td class="heat-cell" style="background:${!finite(v)?'#f5f6f5':v>=0?'#e7f3ef':'#f8eee6'}">${value(v,k)}<span>${r.length?'n='+r.length:'无完整配对'}</span></td>`}).join('')}</tr>`));
  }
  function renderCosts(){
    const s=state(), costs=[0,5,10,20], selected=select(units,s.model,s.pool,s.year).filter(valid), rows=arms.map(arm=>{
      const rs=selected.filter(u=>u.arm===arm&&costs.every(b=>finite(u[`cost_${b}bps_excess_cagr`])));
      return {arm,rs,ys:costs.map(b=>avg(rs,`cost_${b}bps_excess_cagr`))};
    });
    const vals=rows.flatMap(r=>r.ys).filter(finite), lo=Math.min(0,...vals), hi=Math.max(0,...vals), pad=Math.max((hi-lo)*.13,.01), min=lo-pad,max=hi+pad;
    const x=b=>90+b/20*550,y=v=>220-(v-min)/(max-min)*180;
    let svg='<svg viewBox="0 0 780 270" role="img" aria-label="各组成本敏感性：年化净超额的描述均值">';
    for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line x1="90" x2="640" y1="${y(v)}" y2="${y(v)}" stroke="#e5ebed"/><text x="78" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#65737d">${num(v,1,100)}</text>`;}
    svg+=`<text x="10" y="20" font-size="11" fill="#65737d">超额 / pp</text><line x1="90" x2="640" y1="${y(0)}" y2="${y(0)}" stroke="#a5b4bc" stroke-dasharray="4 3"/>`;
    costs.forEach(b=>svg+=`<text x="${x(b)}" y="245" text-anchor="middle" font-size="12" fill="#65737d">${b} bps</text>`);
    rows.forEach((r,i)=>{if(!r.rs.length)return;svg+=`<polyline points="${costs.map((b,j)=>`${x(b)},${y(r.ys[j])}`).join(' ')}" fill="none" stroke="${armColors[i]}" stroke-width="2.5"/>`;costs.forEach((b,j)=>svg+=`<circle cx="${x(b)}" cy="${y(r.ys[j])}" r="4" fill="${armColors[i]}"><title>${r.arm} / ${b} bps：${num(r.ys[j],2,100)} pp，n=${r.rs.length}</title></circle>`);svg+=`<text x="680" y="${40+i*26}" font-size="13" fill="${armColors[i]}">${r.arm} · n=${r.rs.length}</text>`;});
    $('cost-chart').innerHTML=vals.length?'<div class="chart-scroll">'+svg+'</svg></div><p class="mobile-chart-note">图表可横向滑动，下方附完整数值。</p>':'<p class="empty">当前筛选没有四档成本均完整的有效单元。</p>';
    $('cost-table').innerHTML=table(['组','相同样本 n','独立年份',...costs.map(b=>`${b} bps / 超额 pp`)],rows.map(r=>row([r.arm,r.rs.length,years(r.rs),...r.ys.map(v=>signed(v,2,100))])));
  }
  function renderCoverage(){
    const statuses=['valid','failed','partial','empty','running','not_started'];
    $('status-stack').innerHTML=statuses.map(s=>`<span style="width:${count(ds,s)/516*100}%;background:${colors[s]}" title="${statusNames[s]} ${count(ds,s)}"></span>`).join('');
    $('status-legend').innerHTML=statuses.map(s=>`<span><i style="background:${colors[s]}"></i>${statusNames[s]} ${count(ds,s)}</span>`).join('');
    $('coverage-table').innerHTML=table(['组','有效','失败','部分','空组合','运行','未开始','失败 / 已终结','已知请求¹','未知 usage¹'],arms.map(arm=>{
      const rs=ds.filter(u=>u.arm===arm), settled=rs.filter(u=>!['running','not_started','blocked'].includes(u.execution_status)).length;
      return row([arm,...statuses.map(s=>count(rs,s)),`${num(settled?count(rs,'failed')/settled:null,1,100)}% (${count(rs,'failed')}/${settled})`,num(rs.reduce((n,u)=>n+(u.request_count??0),0),0),num(rs.reduce((n,u)=>n+(u.unknown_usage_requests??0),0),0)]);
    }));
    const usage=meta.usage;
    $('budget-note').textContent=`¹ 请求/usage 列为可匹配单元账本记录之和；历史重用与新批次分开。共享新批次账本 ${usage.ledger_started_requests.toLocaleString()} 次启动、${usage.ledger_completed_requests.toLocaleString()} 次完成，上限 13,000；已完成但 usage 未知 ${usage.completed_unknown_usage_requests} 次，已知 ${num(usage.known_unit_tokens,0)} tokens。旧 188 请求继承沿用冻结协议；历史重用单元的可追溯请求另列，不并入这里的新批次账本。GLM 303 格用户排除仍留在原始 1032 格矩阵中。`;
  }
  $('verdict-title').textContent=`摘要增量：${positivePools} 个股票池为正，${pools.length-positivePools} 个为负。`;
  $('verdict-text').textContent=`在本快照的 DeepSeek M3−M2 ${mainPairs.length} 个完整配对中，年度净收益平均差 ${num(mainNet,3,100,true)} 个百分点，signed RankIC 平均差 ${num(mainIC,5,1,true)}。先在每年内平均配对差、再让各年等权，净收益差为 ${num(mainYearEqual,2,100,true)} 个百分点。M3 失败 ${m3Failures}/${m3.length} 格（${num(m3Failures/m3.length,1,100)}%）。这些是双方有效条件下的结果；执行失败与额外资源成本不会体现在这个收益均值里。本轮 DeepSeek 范围已全部终结；这些回溯描述不能替代新样本验证。`;
  $('provenance').innerHTML=`来源快照：${esc(meta.as_of)}。已核对 ${meta.checks.unique_units} 个唯一单元和 ${meta.checks.source_pairs_checked} 条模型内原始配对记录；网页跨模型比较重新按同组匹配。<br><span class="hash">summary.csv SHA-256 · ${meta.source_hashes['summary.csv']}</span>`;
  function render(){renderGroups();renderPairs();renderCosts();}
  ['model','pool','year','contrast','metric','sample'].forEach(id=>$(id).addEventListener('change',render));
  $('reset').addEventListener('click',()=>{$('model').value='deepseek';$('pool').value='all';$('year').value='all';$('contrast').value='M3-M2';$('metric').value='net_cumulative_return';$('sample').value='pair';render();});
  $('close-detail').addEventListener('click',()=>$('detail').close());
  renderCoverage();render();
})();
