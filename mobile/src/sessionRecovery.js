'use strict';
// A temporary backend outage must not be treated as a revoked user session.
function shouldRetrySession(error){
  const status=Number(error?.status||0);
  return status===0||status===408||status===429||status>=500;
}
module.exports={shouldRetrySession};
