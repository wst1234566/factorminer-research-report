/* Pure display calculations. Null is missing; never imputed as zero. */
(() => {
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const mean = xs => { const v=xs.filter(finite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const valid = u => u.execution_status === 'valid' && u.evaluation_status === 'EVALUATED';
  const years = xs => new Set(xs.map(x=>x.test_year)).size;
  const select = (units,model,pool='all',year='all') => units.filter(u=>u.model===model && (pool==='all'||u.industry===pool) && (year==='all'||u.test_year===Number(year)));
  const pairs = (units,{model='deepseek',pool='all',year='all',contrast='M3-M2',common=false}={}) => {
    const filtered=units.filter(u=>(pool==='all'||u.industry===pool) && (year==='all'||u.test_year===Number(year)));
    const key=u=>[u.model,u.industry,u.test_year,u.repeat,u.arm].join('|');
    const lookup=new Map(filtered.filter(valid).map(u=>[key(u),u]));
    const find=(u,m,a)=>lookup.get([m,u.industry,u.test_year,u.repeat,a].join('|'));
    const four=(u,m)=>['M0','M1','M2','M3'].every(a=>find(u,m,a));
    const cross=contrast==='Flash-GLM', [a,b]=contrast.split('-'), output=[];
    for(const u of filtered.filter(valid)) {
      if(u.model!==(cross?'deepseek':model) || (!cross && u.arm!==a)) continue;
      const right=find(u,cross?'glm':model,cross?u.arm:b);
      if(!right || (common && (!four(u,u.model) || (cross && !four(u,'glm'))))) continue;
      output.push({left:u,right,industry:u.industry,test_year:u.test_year,repeat:u.repeat,arm:u.arm});
    }
    return output;
  };
  const delta = (p,k) => finite(p.left[k]) && finite(p.right[k]) ? p.left[k]-p.right[k] : null;
  const result={finite,mean,valid,years,select,pairs,delta};
  if(typeof module!=='undefined') module.exports=result; else window.ResearchMath=result;
})();
