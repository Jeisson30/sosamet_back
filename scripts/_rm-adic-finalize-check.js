const fs = require('fs');
const p =
  '../sosamet/src/app/features/gestion/pages/ejecucion-cortes/assign-ejecucion-cortes/assign-ejecucion-cortes.component.ts';
let t = fs.readFileSync(p, 'utf8');

t = t.replace(
  /\n\s*if \(!this\.todosAdicionalesChecked\) \{[\s\S]*?\n\s*\}\n/,
  '\n'
);

fs.writeFileSync(p, t);
const again = fs.readFileSync(p, 'utf8');
console.log(
  'still validates adicionales on finalize',
  /onFinalizar[\s\S]{0,1200}todosAdicionalesChecked/.test(again)
);
