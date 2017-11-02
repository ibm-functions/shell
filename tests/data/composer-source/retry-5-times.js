composer.retry(5, composer.if("isTrue", composer.sequence("seq1", "seq2", "seq3"), composer.sequence("seq4", "seq5")))
