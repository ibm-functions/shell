composer.if(p=>p.condition, composer.sequence(p=>({path:true})), composer.sequence(p=>({path:false})));
