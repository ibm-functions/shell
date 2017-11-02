composer.if(
  /* cond */ 'authenticate',,  /* double comma, expect parse error */
  /* then */ 'welcome',
  /* else */ 'login')
