module.exports=[55606,(e,t,r)=>{"use strict";let n;Object.defineProperty(r,"__esModule",{value:!0}),r.format=function(e){let{type:t,parameters:r}=e;if(!t||!a.test(t))throw TypeError(`Invalid type: ${t}`);let n=t;if(r)for(let e of Object.keys(r)){if(!s.test(e))throw TypeError(`Invalid parameter name: ${e}`);n+=`; ${e}=${function(e){if(s.test(e))return e;if(i.test(e))return`"${e.replace(o,"\\$&")}"`;throw TypeError(`Invalid parameter value: ${e}`)}(r[e])}`}return n},r.parse=function(e,t){let r=e.length,n=c(e,0,r),i=n;n=l(e,n,r);let s=d(e,i,n);return{type:e.slice(i,s).toLowerCase(),parameters:t?.parameters===!1?new u:function(e,t,r){let n=new u;e:for(;t<r;){let i=t=c(e,t+1,r);for(;t<r;){let s=e.charCodeAt(t);if(59===s)continue e;if(61===s){let s=d(e,i,t),o=e.slice(i,s).toLowerCase();if((t=c(e,t+1,r))<r&&34===e.charCodeAt(t)){t++;let i="";for(;t<r;){let s=e.charCodeAt(t++);if(34===s){t=l(e,t,r),void 0===n[o]&&(n[o]=i);break}if(92===s&&t<r){i+=e[t++];continue}i+=String.fromCharCode(s)}continue e}let a=t;if(t=l(e,t,r),void 0===n[o]){let r=d(e,a,t);n[o]=e.slice(a,r)}continue e}t++}}return n}(e,n,r)}};let i=/^[\u0009\u0020-\u007e\u0080-\u00ff]*$/,s=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/,o=/[\\"]/g,a=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/,u=((n=function(){}).prototype=Object.create(null),n);function l(e,t,r){for(;t<r&&59!==e.charCodeAt(t);)t++;return t}function c(e,t,r){for(;t<r;){let r=e.charCodeAt(t);if(32!==r&&9!==r)break;t++}return t}function d(e,t,r){for(;r>t;){let t=e.charCodeAt(r-1);if(32!==t&&9!==t)break;r--}return r}},67123,53532,e=>{"use strict";var t=e.i(66680);function r(){return"object"==typeof navigator&&"userAgent"in navigator?navigator.userAgent:"object"==typeof process&&void 0!==process.version?`Node.js/${process.version.substr(1)} (${process.platform}; ${process.arch})`:"<environment undetectable>"}var n=`octokit-endpoint.js/0.0.0-development ${r()}`;function i(e){for(let t in e)void 0===e[t]&&delete e[t];return e}function s(e,t,r){var n;if("string"==typeof t){let[e,n]=t.split(" ");r=Object.assign(n?{method:e,url:n}:{url:e},r)}else r=Object.assign({},t);r.headers=(n=r.headers)?Object.keys(n).reduce((e,t)=>(e[t.toLowerCase()]=n[t],e),{}):{},i(r),i(r.headers);let s=function e(t,r){let n=Object.assign({},t);return Object.keys(r).forEach(i=>{(function(e){if("object"!=typeof e||null===e||"[object Object]"!==Object.prototype.toString.call(e))return!1;let t=Object.getPrototypeOf(e);if(null===t)return!0;let r=Object.prototype.hasOwnProperty.call(t,"constructor")&&t.constructor;return"function"==typeof r&&r instanceof r&&Function.prototype.call(r)===Function.prototype.call(e)})(r[i])&&i in t?n[i]=e(t[i],r[i]):Object.assign(n,{[i]:r[i]})}),n}(e||{},r);return"/graphql"===r.url&&(e&&e.mediaType.previews?.length&&(s.mediaType.previews=e.mediaType.previews.filter(e=>!s.mediaType.previews.includes(e)).concat(s.mediaType.previews)),s.mediaType.previews=(s.mediaType.previews||[]).map(e=>e.replace(/-preview/,""))),s}var o=/\{[^{}}]+\}/g;function a(e){return e.replace(/(?:^\W+)|(?:(?<!\W)\W+$)/g,"").split(/,/)}function u(e,t){let r={__proto__:null};for(let n of Object.keys(e))-1===t.indexOf(n)&&(r[n]=e[n]);return r}function l(e){return e.split(/(%[0-9A-Fa-f]{2})/g).map(function(e){return/%[0-9A-Fa-f]/.test(e)||(e=encodeURI(e).replace(/%5B/g,"[").replace(/%5D/g,"]")),e}).join("")}function c(e){return encodeURIComponent(e).replace(/[!'()*]/g,function(e){return"%"+e.charCodeAt(0).toString(16).toUpperCase()})}function d(e,t,r){return(t="+"===e||"#"===e?l(t):c(t),r)?c(r)+"="+t:t}function p(e){return null!=e}function h(e){return";"===e||"&"===e||"?"===e}function m(e,t){var r=["+","#",".","/",";","?","&"];return"/"===(e=e.replace(/\{([^\{\}]+)\}|([^\{\}]+)/g,function(e,n,i){if(!n)return l(i);{let e="",i=[];if(-1!==r.indexOf(n.charAt(0))&&(e=n.charAt(0),n=n.substr(1)),n.split(/,/g).forEach(function(r){var n=/([^:\*]*)(?::(\d+)|(\*))?/.exec(r);i.push(function(e,t,r,n){var i=e[r],s=[];if(p(i)&&""!==i)if("string"==typeof i||"number"==typeof i||"bigint"==typeof i||"boolean"==typeof i)i=i.toString(),n&&"*"!==n&&(i=i.substring(0,parseInt(n,10))),s.push(d(t,i,h(t)?r:""));else if("*"===n)Array.isArray(i)?i.filter(p).forEach(function(e){s.push(d(t,e,h(t)?r:""))}):Object.keys(i).forEach(function(e){p(i[e])&&s.push(d(t,i[e],e))});else{let e=[];Array.isArray(i)?i.filter(p).forEach(function(r){e.push(d(t,r))}):Object.keys(i).forEach(function(r){p(i[r])&&(e.push(c(r)),e.push(d(t,i[r].toString())))}),h(t)?s.push(c(r)+"="+e.join(",")):0!==e.length&&s.push(e.join(","))}else";"===t?p(i)&&s.push(c(r)):""===i&&("&"===t||"?"===t)?s.push(c(r)+"="):""===i&&s.push("");return s}(t,e,n[1],n[2]||n[3]))}),!e||"+"===e)return i.join(",");var s=",";return"?"===e?s="&":"#"!==e&&(s=e),(0!==i.length?e:"")+i.join(s)}}))?e:e.replace(/\/$/,"")}function f(e){let t,r,n=e.method.toUpperCase(),i=(e.url||"/").replace(/:([a-z]\w+)/g,"{$1}"),s=Object.assign({},e.headers),l=u(e,["method","baseUrl","url","headers","request","mediaType"]),c=(t=i.match(o))?t.map(a).reduce((e,t)=>e.concat(t),[]):[];i=({expand:m.bind(null,i)}).expand(l),/^http/.test(i)||(i=e.baseUrl+i);let d=u(l,Object.keys(e).filter(e=>c.includes(e)).concat("baseUrl"));if(!/application\/octet-stream/i.test(s.accept)&&(e.mediaType.format&&(s.accept=s.accept.split(/,/).map(t=>t.replace(/application\/vnd(\.\w+)(\.v3)?(\.\w+)?(\+json)?$/,`application/vnd$1$2.${e.mediaType.format}`)).join(",")),i.endsWith("/graphql")&&e.mediaType.previews?.length)){let t=s.accept.match(/(?<![\w-])[\w-]+(?=-preview)/g)||[];s.accept=t.concat(e.mediaType.previews).map(t=>{let r=e.mediaType.format?`.${e.mediaType.format}`:"+json";return`application/vnd.github.${t}-preview${r}`}).join(",")}if(["GET","HEAD"].includes(n)){var p;let e,t;p=i,e=/\?/.test(p)?"&":"?",i=0===(t=Object.keys(d)).length?p:p+e+t.map(e=>"q"===e?"q="+d.q.split("+").map(encodeURIComponent).join("+"):`${e}=${encodeURIComponent(d[e])}`).join("&")}else"data"in d?r=d.data:Object.keys(d).length&&(r=d);return s["content-type"]||void 0===r||(s["content-type"]="application/json; charset=utf-8"),["PATCH","PUT"].includes(n)&&void 0===r&&(r=""),Object.assign({method:n,url:i,headers:s},void 0!==r?{body:r}:null,e.request?{request:e.request}:null)}function g(e,t,r){return f(s(e,t,r))}var w=function e(t,r){let n=s(t,r);return Object.assign(g.bind(null,n),{DEFAULTS:n,defaults:e.bind(null,n),merge:s.bind(null,n),parse:f})}(null,{method:"GET",baseUrl:"https://api.github.com",headers:{accept:"application/vnd.github.v3+json","user-agent":n},mediaType:{format:""}}),y=e.i(55606);let v=/^-?\d+$/,b=/^-?\d+n+$/,E=JSON.stringify,S=JSON.parse,R=/^-?\d+n$/,A=/([\[:])?"(-?\d+)n"($|([\\n]|\s)*(\s|[\\n])*[,\}\]])/g,q=/([\[:])?("-?\d+n+)n("$|"([\\n]|\s)*(\s|[\\n])*[,\}\]])/g,$=new Map,O=Number.MAX_SAFE_INTEGER.toString(),D=O.length,T=/"(?:\\.|[^"])*"|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/g,_=/^"-?\d+n+"$/;class j extends Error{name;status;request;response;constructor(e,t,r){super(e,{cause:r.cause}),this.name="HttpError",this.status=Number.parseInt(t),Number.isNaN(this.status)&&(this.status=0),"response"in r&&(this.response=r.response);const n=Object.assign({},r.request);r.request.headers.authorization&&(n.headers=Object.assign({},r.request.headers,{authorization:r.request.headers.authorization.replace(/(?<! ) .*$/," [REDACTED]")})),n.url=n.url.replace(/\bclient_secret=\w+/g,"client_secret=[REDACTED]").replace(/\baccess_token=\w+/g,"access_token=[REDACTED]"),this.request=n}}var k={headers:{"user-agent":`octokit-request.js/10.0.10 ${r()}`}},U=()=>"";async function I(e){var t;let r,n=e.request?.fetch||globalThis.fetch;if(!n)throw Error("fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing");let i=e.request?.log||console,s=e.request?.parseSuccessResponseBody!==!1,o=function(e){if("object"!=typeof e||null===e||"[object Object]"!==Object.prototype.toString.call(e))return!1;let t=Object.getPrototypeOf(e);if(null===t)return!0;let r=Object.prototype.hasOwnProperty.call(t,"constructor")&&t.constructor;return"function"==typeof r&&r instanceof r&&Function.prototype.call(r)===Function.prototype.call(e)}(e.body)||Array.isArray(e.body)?(t=e.body,"rawJSON"in JSON?E(t,(e,t)=>"bigint"==typeof t?JSON.rawJSON(t.toString()):(Array.isArray(void 0)&&(void 0).includes(e),t),void 0):t?E(t,(e,t)=>"string"==typeof t&&b.test(t)||"bigint"==typeof t?t.toString()+"n":(Array.isArray(void 0)&&(void 0).includes(e),t),void 0).replace(A,"$1$2$3").replace(q,"$1$2$3"):E(t,void 0,void 0)):e.body,a=Object.fromEntries(Object.entries(e.headers).map(([e,t])=>[e,String(t)]));try{r=await n(e.url,{method:e.method,body:o,redirect:e.request?.redirect,headers:a,signal:e.request?.signal,...e.body&&{duplex:"half"}})}catch(n){let t="Unknown Error";if(n instanceof Error){if("AbortError"===n.name)throw n.status=500,n;t=n.message,"TypeError"===n.name&&"cause"in n&&(n.cause instanceof Error?t=n.cause.message:"string"==typeof n.cause&&(t=n.cause))}let r=new j(t,500,{request:e});throw r.cause=n,r}let u=r.status,l=r.url,c={};for(let[e,t]of r.headers)c[e]=t;let d={url:l,status:u,headers:c,data:""};if("deprecation"in c){let t=c.link&&c.link.match(/<([^<>]+)>; rel="deprecation"/),r=t&&t.pop();i.warn(`[@octokit/request] "${e.method} ${e.url}" is deprecated. It is scheduled to be removed on ${c.sunset}${r?`. See ${r}`:""}`)}if(204===u||205===u)return d;if("HEAD"===e.method){if(u<400)return d;throw new j(r.statusText,u,{response:d,request:e})}if(304===u)throw d.data=await C(r),new j("Not modified",u,{response:d,request:e});if(u>=400)throw d.data=await C(r),new j(function(e){if("string"==typeof e)return e;if(e instanceof ArrayBuffer)return"Unknown error";if("message"in e){let t="documentation_url"in e?` - ${e.documentation_url}`:"";return Array.isArray(e.errors)?`${e.message}: ${e.errors.map(e=>JSON.stringify(e)).join(", ")}${t}`:`${e.message}${t}`}return`Unknown error: ${JSON.stringify(e)}`}(d.data),u,{response:d,request:e});return d.data=s?await C(r):r.body,d}async function C(e){let t=e.headers.get("content-type");if(!t)return e.text().catch(U);let r=(0,y.parse)(t);if("application/json"===(n=r).type||"application/scim+json"===n.type){let t="";try{var n,i=t=await e.text();if(!i)return S(i,void 0);if((()=>{let e=JSON.parse.toString();if($.has(e))return $.get(e);try{let t=JSON.parse("1",(e,t,r)=>!!r?.source&&"1"===r.source);return $.set(e,t),t}catch{return $.set(e,!1),!1}})()){let e;return e=void 0,JSON.parse(i,(t,r,n)=>{let i="number"==typeof r&&(r>Number.MAX_SAFE_INTEGER||r<Number.MIN_SAFE_INTEGER),s=n&&v.test(n.source);return i&&s?BigInt(n.source):"function"!=typeof e?r:e(t,r,n)})}return S(i.replace(T,(e,t,r,n)=>{let i='"'===e[0];if(i&&_.test(e))return e.substring(0,e.length-1)+'n"';let s=t&&(t.length<D||t.length===D&&t<=O);return i||r||n||s?e:'"'+e+'n"'}),(e,t,r)=>{var n;return n=void 0,"string"==typeof t&&R.test(t)?BigInt(t.slice(0,-1)):"string"==typeof t&&b.test(t)?t.slice(0,-1):"function"!=typeof n?t:n(e,t,r)})}catch(e){return t}}return r.type.startsWith("text/")||r.parameters.charset?.toLowerCase()==="utf-8"?e.text().catch(U):e.arrayBuffer().catch(()=>new ArrayBuffer(0))}var P=function e(t,r){let n=t.defaults(r);return Object.assign(function(t,r){let i=n.merge(t,r);if(!i.request||!i.request.hook)return I(n.parse(i));let s=(e,t)=>I(n.parse(n.merge(e,t)));return Object.assign(s,{endpoint:n,defaults:e.bind(null,n)}),i.request.hook(s,i)},{endpoint:n,defaults:e.bind(null,n)})}(w,k),N=class extends Error{constructor(e,t,r){super(function(e){return`Request failed due to following response errors:
`+e.errors.map(e=>` - ${e.message}`).join("\n")}(r)),this.request=e,this.headers=t,this.response=r,this.errors=r.errors,this.data=r.data,Error.captureStackTrace&&Error.captureStackTrace(this,this.constructor)}name="GraphqlResponseError";errors;data},W=["method","baseUrl","url","headers","request","query","mediaType","operationName"],x=["query","method","url"],M=/\/api\/v3\/?$/,Q=function e(t,r){let n=t.defaults(r);return Object.assign((e,t)=>(function(e,t,r){if(r){if("string"==typeof t&&"query"in r)return Promise.reject(Error('[@octokit/graphql] "query" cannot be used as variable name'));for(let e in r)if(x.includes(e))return Promise.reject(Error(`[@octokit/graphql] "${e}" cannot be used as variable name`))}let n="string"==typeof t?Object.assign({query:t},r):t,i=Object.keys(n).reduce((e,t)=>(W.includes(t)?e[t]=n[t]:(e.variables||(e.variables={}),e.variables[t]=n[t]),e),{}),s=n.baseUrl||e.endpoint.DEFAULTS.baseUrl;return M.test(s)&&(i.url=s.replace(M,"/api/graphql")),e(i).then(e=>{if(e.data.errors){let t={};for(let r of Object.keys(e.headers))t[r]=e.headers[r];throw new N(i,t,e.data)}return e.data.data})})(n,e,t),{defaults:e.bind(null,n),endpoint:n.endpoint})}(P,{headers:{"user-agent":`octokit-graphql.js/0.0.0-development ${r()}`},method:"POST",url:"/graphql"});function G(e){return Q.defaults({headers:{authorization:`token ${e}`}})}let B=0,H=[];async function F(e){B>=3?await new Promise(e=>H.push(e)):B++;try{return await e()}finally{let e=H.shift();e?e():B--}}async function L(e,r,n){let i=()=>F(async()=>{try{return{data:await G(e)(r,n),partial:!1}}catch(e){if(e instanceof N&&e.data)return{data:e.data,partial:!0};throw e}});try{return await i()}catch(r){let e=function(e){let r=e??{};if(403!==r.status&&429!==r.status||403===r.status&&!/secondary rate limit|abuse detection/i.test(r.message??""))return null;let n=Number(r.response?.headers?.["retry-after"]);return!Number.isFinite(n)||n<=0||1e3*n+2e3>5e3?null:1e3*n+(0,t.randomInt)(2e3)}(r);if(null===e)throw V(r),r;await new Promise(t=>setTimeout(t,e));try{return await i()}catch(e){throw V(e),e}}}function V(e){let t=e??{},r=(Array.isArray(t.errors)?t.errors:[]).map(e=>`${e?.type??"?"}: ${String(e?.message??"").slice(0,160)}`).join(" | "),n=t.response?.headers?.["retry-after"],i=void 0===n?"absent":String(n).slice(0,32);console.error(`[github] upstream query failed: status=${t.status??"?"} name=${t.name??"?"} retry-after=${i} `+(r||String(t.message??"no detail").slice(0,200)))}e.s(["ghClient",0,G,"ghQuery",0,L],67123);let Y="author:@me",z={author:Y,ready:Y,closed:Y,review:"review-requested:@me",reviewed:"reviewed-by:@me -author:@me"},J="rateLimit { cost remaining resetAt }",K=`
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`,X=`statusCheckRollup { state contexts(first: 100) { nodes {
            ... on CheckRun {
              name status conclusion completedAt
              checkSuite { workflowRun { workflow { name } } }
            }
            ... on StatusContext { context state }
          } } }`,Z="reviewThreads(first: 20) { nodes { isResolved } }",ee=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft mergeStateStatus reviewDecision
        repository { nameWithOwner }
        # One entry per reviewer, their most recent review of any kind — which
        # is what the PR page's own reviewer list shows, and what reviewDecision
        # ignores. See supersededDecision.
        latestReviews(first: 20) { nodes { state } }
        ${Z}
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          ${X}
        } } }
      } }
    }
      ${J}
  }`,et=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft updatedAt
        # Plain fields, so free: the size behind a rough review time.
        additions deletions changedFiles
        repository { nameWithOwner }
        author { login }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], first: 100) {
          nodes { ... on ReviewRequestedEvent {
            createdAt requestedReviewer { ... on User { login } }
          } }
        }
      } }
    }
      ${J}
  }`,er=new Set(["FAILURE","ERROR","TIMED_OUT"]),en=new Set(["PENDING","EXPECTED","QUEUED","IN_PROGRESS"]);function ei(e){let t=e.conclusion??e.status??e.state??"";return er.has(t)?"failing":en.has(t)?"pending":"ok"}function es(e){return e.reduce((e,t)=>!t.completedAt||e.completedAt&&t.completedAt>e.completedAt?t:e,e[0])}function eo(e){let{named:t,unnamed:r}=function(e){let t=new Map,r=[];for(let n of e){let e=void 0===n.name?n.context||void 0:n.name||void 0;e?t.set(e,[...t.get(e)??[],n]):r.push(n)}return{named:t,unnamed:r}}(e),n=[],i=[];for(let[e,r]of t){let t=function(e){let t=new Map;e.forEach((e,r)=>{let n,i=(n=e.checkSuite?.workflowRun?.workflow?.name)?`workflow:${n}`:`solo:${r}`;t.set(i,[...t.get(i)??[],e])});let r=Array.from(t.values(),es);return r.some(e=>"failing"===ei(e))?"failing":r.some(e=>"pending"===ei(e))?"pending":"ok"}(r);"failing"===t?n.push(e):"pending"===t&&i.push(e)}let s=r.map(ei),o=n.length+s.filter(e=>"failing"===e).length,a=i.length+s.filter(e=>"pending"===e).length;return{failing:n,pending:i,failingChecks:o,pendingChecks:a,checkNames:Array.from(t.keys())}}function ea(e){return(e?.reviewThreads?.nodes??[]).filter(e=>e&&!e.isResolved).length}function eu(e){if("BLOCKED"!==e.mergeStateStatus||"APPROVED"!==e.reviewDecision||ea(e)>0)return!1;let t=e.commits?.nodes?.[0]?.commit?.statusCheckRollup;if(t?.state==="SUCCESS")return!0;let r=t?.contexts?.nodes??[];if(0===r.length)return!1;let{failingChecks:n,pendingChecks:i}=eo(r);return 0===n&&0===i}let el=`
  query($q: String!, $withStarter: Boolean!, $withReviews: Boolean!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id number url repository { nameWithOwner }
        # The body of a submitted review — the second of GitHub's three comment
        # surfaces, and the one that made this issue: a question typed into the
        # review box lives here, not in reviewThreads, so a PR with no inline
        # thread at all could carry an unanswered question invisibly.
        #
        # Own-PR leg only. On someone else's PR a review body is either the
        # viewer's own (waiting on the author) or another reviewer's (waiting on
        # nobody in particular) — neither is the viewer's to answer, and this is
        # the heaviest query in the app, so the reviewed leg does not pay for it.
        reviews(last: 20) @include(if: $withReviews) { nodes {
          id url bodyText submittedAt
          author { login __typename }
          reactionGroups { viewerHasReacted }
        } }
        # Not rows — the answer signal. A review body has no replies, so
        # "answered" has to be read off the PR: the viewer saying anything in the
        # conversation after the review was submitted. See parsePrComments.
        #
        # A window, so on a PR that stays chatty long after the viewer answered,
        # their answer can fall out of it and the row comes back. That is the
        # forgiving failure this heuristic already accepts — a handled row costs
        # a glance, where the other direction hides an unanswered question — so
        # it stays a window rather than growing the heaviest query in the app.
        #
        # Also the third surface: a plain conversation comment from someone else
        # after the viewer last spoke is a row of its own.
        comments(last: 20) @include(if: $withReviews) { nodes {
          id url bodyText createdAt
          author { login __typename }
          reactionGroups { viewerHasReacted }
        } }
        reviewThreads(first: 50) { nodes {
          id isResolved path
          # Who opened the thread. On the viewer's own PRs every unresolved
          # thread is theirs to answer, but on someone else's PR only the
          # threads the viewer started are — see parsePrComments. This is the
          # heaviest query in the app and it now runs twice per refresh, so the
          # own-PR leg, which never reads this, does not pay for it.
          starter: comments(first: 1) @include(if: $withStarter) { nodes { author { login } } }
          comments(last: 1) { nodes {
            author { login __typename }
            bodyText createdAt url
            reactionGroups { viewerHasReacted }
          } }
        } }
      } }
    }
      ${J}
  }`;function ec(e){let t=e?.search?.nodes;return Array.isArray(t)?t:[]}function ed(e){let t=e.replace(/\s+/g," ").trim();return t.length>140?`${t.slice(0,140)}…`:t}function ep(e,t){return(e.comments?.nodes??[]).filter(e=>e?.author?.login===t).reduce((e,t)=>t.createdAt>e?t.createdAt:e,"")}let eh=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft updatedAt
        mergeStateStatus reviewDecision
        repository { nameWithOwner }
        ${Z}
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          ${X}
        } } }
      } }
    }
      ${J}
  }`,em=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number merged mergedAt closedAt
        repository { nameWithOwner }
      } }
    }
      ${J}
  }`,ef=`
  query($q: String!, $login: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft
        repository { nameWithOwner }
        author { login }
        # DISMISSED belongs here even though it is not a verdict: without it a
        # dismissed review falls through to an older one, so the row badges a
        # stale opinion — or the PR vanishes from the list while reviewed-by:@me
        # still matches it.
        reviews(last: 1, author: $login, states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]) {
          nodes { state submittedAt }
        }
        commits(last: 1) { nodes { commit { pushedDate committedDate } } }
      } }
    }
      ${J}
  }`,eg=new Set(["APPROVED","CHANGES_REQUESTED","COMMENTED","DISMISSED"]),ew=`
  query($q: String!) {
    search(query: $q, type: REPOSITORY, first: 20) {
      nodes {
        ... on Repository {
          nameWithOwner
        }
      }
    }
  }`,ey=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft createdAt
        repository { nameWithOwner }
        author { login }
        reviewRequests(first: 10) { nodes { requestedReviewer {
          __typename ... on User { login } ... on Team { combinedSlug }
        } } }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 30) {
          nodes { ... on ReviewRequestedEvent {
            createdAt requestedReviewer { ... on User { login } ... on Team { combinedSlug } }
          } }
        }
        latestReviews(first: 20) { nodes { state submittedAt author { login } } }
        commits(last: 1) { nodes { commit { pushedDate committedDate } } }
      } }
    }
      ${J}
  }`,ev=e=>e?.login??e?.combinedSlug??"",eb=`
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number
        repository { nameWithOwner }
        author { login }
        reviews(last: 50) { nodes { submittedAt author { login } } }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 30) {
          nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } } }
        }
      } }
    }
      ${J}
  }`;e.s(["AWAITING_REVIEWERS_QUERY",0,ey,"CLOSED_PRS_QUERY",0,em,"MY_WEEK_QUERY",0,eb,"ORGS_QUERY",0,K,"PR_COMMENTS_QUERY",0,el,"READY_PRS_QUERY",0,eh,"REPO_SEARCH_QUERY",0,ew,"REVIEWED_PRS_QUERY",0,ef,"REVIEW_REQUESTS_QUERY",0,et,"STUCK_PRS_QUERY",0,ee,"VIEWER_QUERY",0,"query { viewer { login } }","myWeekSearch",0,function(e,t){let r=t?` ${t}`:"";return`is:pr reviewed-by:@me -author:@me updated:>=${e}${r} sort:updated-desc`},"parseAwaitingReviewers",0,function(e){let t=[];for(let r of ec(e)){if(!r?.id)continue;let e=r.commits?.nodes?.[0]?.commit??{},n=e.pushedDate??e.committedDate??r.createdAt??"",i=function(e){let t=function(e){let t=new Map;for(let r of e.timelineItems?.nodes??[]){let e=ev(r?.requestedReviewer);e&&r.createdAt&&t.set(e,r.createdAt)}return t}(e),r=[];for(let n of e.reviewRequests?.nodes??[]){let i=n?.requestedReviewer,s=ev(i);!s||r.some(e=>e.name===s)||r.push({name:s,team:"Team"===i.__typename,state:"requested",since:t.get(s)??e.createdAt??""})}return r}(r);for(let e of r.latestReviews?.nodes??[]){let t=e?.author?.login;if(!t||t===r.author?.login||i.some(e=>e.name===t))continue;let s=function(e,t,r){if("APPROVED"===e.state)return{name:t,team:!1,state:"approved",since:e.submittedAt};if("COMMENTED"===e.state)return{name:t,team:!1,state:"commented",since:e.submittedAt};if("CHANGES_REQUESTED"!==e.state)return null;let n=!!r&&r>e.submittedAt;return{name:t,team:!1,state:"changes",since:n?r:e.submittedAt,pushedSince:n}}(e,t,n);s&&i.push(s)}let s=i.filter(e=>"requested"===e.state||"changes"===e.state&&e.pushedSince).map(e=>e.since).sort((e,t)=>e.localeCompare(t));0!==s.length&&t.push({id:r.id,title:r.title,url:r.url,number:r.number,repo:r.repository?.nameWithOwner??"",isDraft:r.isDraft??!1,waitingSince:s[0],reviewers:i})}return t},"parseClosedPrs",0,function(e){return ec(e).filter(e=>e?.id).map(e=>({id:e.id,title:e.title,url:e.url,number:e.number,repo:e.repository?.nameWithOwner??"",merged:!!e.merged,endedAt:e.mergedAt??e.closedAt??""}))},"parseMyWeek",0,function(e,t){let r=[];for(let n of ec(e)){if(!n?.id)continue;let e=(n.timelineItems?.nodes??[]).filter(e=>e?.requestedReviewer?.login===t&&e.createdAt).map(e=>e.createdAt).sort((e,t)=>e.localeCompare(t));for(let i of n.reviews?.nodes??[]){if(i?.author?.login!==t||!i.submittedAt)continue;let s=e.findLast(e=>e<=i.submittedAt);r.push({prId:n.id,title:n.title,url:n.url,number:n.number,repo:n.repository?.nameWithOwner??"",author:n.author?.login??"unknown",submittedAt:i.submittedAt,waitedMs:s?new Date(i.submittedAt).getTime()-new Date(s).getTime():null})}}return r},"parseOrgs",0,function(e){return(e?.viewer?.organizations?.nodes??[]).map(e=>({login:e.login,avatarUrl:e.avatarUrl}))},"parsePrComments",0,function(e,t,r=!1){return ec(e).filter(e=>e?.id).flatMap(e=>{var n,i,s;return[...function(e,t){let r=e.reviews?.nodes;if(!Array.isArray(r))return[];let n=ep(e,t);return r.filter(e=>e?.id&&e.submittedAt>n).filter(e=>e.author?.login&&e.author.login!==t).filter(e=>""!==(e.bodyText??"").trim()).map(t=>({id:t.id,prId:e.id,url:t.url??e.url,repo:e.repository?.nameWithOwner??"",number:e.number,author:t.author.login,isBot:"Bot"===t.author.__typename,path:"",source:"review",preview:ed(t.bodyText),commentedAt:t.submittedAt,viewerReacted:(t.reactionGroups??[]).some(e=>e?.viewerHasReacted===!0),viewerStarted:!1}))}(e,t),...function(e,t){if(!Array.isArray(e.comments?.nodes))return[];let r=ep(e,t);return e.comments.nodes.filter(e=>e?.id&&e.createdAt>r).filter(e=>e.author?.login&&e.author.login!==t).filter(e=>""!==(e.bodyText??"").trim()).map(t=>({id:t.id,prId:e.id,url:t.url??e.url,repo:e.repository?.nameWithOwner??"",number:e.number,author:t.author.login,isBot:"Bot"===t.author.__typename,path:"",source:"conversation",preview:ed(t.bodyText),commentedAt:t.createdAt,viewerReacted:(t.reactionGroups??[]).some(e=>e?.viewerHasReacted===!0),viewerStarted:!1}))}(e,t),...(n=e,i=t,s=r,(n.reviewThreads?.nodes??[]).filter(e=>e?.isResolved===!1).map(e=>({thread:e,last:e.comments?.nodes?.[0]})).filter(({thread:e})=>!s||e.starter?.nodes?.[0]?.author?.login===i).filter(({last:e})=>e?.author?.login&&e.author.login!==i).map(({thread:e,last:t})=>({id:e.id,prId:n.id,url:t.url??n.url,repo:n.repository?.nameWithOwner??"",number:n.number,author:t.author.login,isBot:"Bot"===t.author.__typename,path:e.path??"",source:"thread",preview:ed(t.bodyText??""),commentedAt:t.createdAt??"",viewerReacted:(t.reactionGroups??[]).some(e=>e?.viewerHasReacted===!0),viewerStarted:s})))]})},"parseReadyPrs",0,function(e){return ec(e).filter(e=>e?.id).filter(e=>"CLEAN"===e.mergeStateStatus||function(e){if("BEHIND"!==e.mergeStateStatus)return!1;let{failingChecks:t,pendingChecks:r}=eo(e.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes??[]);return 0===t&&0===r}(e)||eu(e)).filter(e=>!e.isDraft).map(e=>{let t=e.commits?.nodes?.[0]?.commit??{},{checkNames:r}=eo(t.statusCheckRollup?.contexts?.nodes??[]);return{id:e.id,title:e.title,url:e.url,number:e.number,repo:e.repository?.nameWithOwner??"",readySince:t.pushedDate??t.committedDate??e.updatedAt??"",needsUpdate:"CLEAN"!==e.mergeStateStatus,checkNames:r,viaBlocked:eu(e)}})},"parseRepoSearch",0,function(e){let t=ec(e),r=new Set,n=[];for(let e of t){let t=e?.nameWithOwner;t&&!r.has(t)&&(r.add(t),n.push(t))}return n},"parseReviewRequests",0,function(e,t){return ec(e).filter(e=>e?.id).map(e=>{let r=(e.timelineItems?.nodes??[]).findLast(e=>e?.requestedReviewer?.login===t);return{id:e.id,title:e.title,url:e.url,number:e.number,repo:e.repository?.nameWithOwner??"",author:e.author?.login??"unknown",requestedAt:r?.createdAt??e.updatedAt??"",requestedDirectly:!!r?.createdAt,isDraft:e.isDraft??!1,..."number"==typeof e.additions?{additions:e.additions}:{},..."number"==typeof e.deletions?{deletions:e.deletions}:{},..."number"==typeof e.changedFiles?{changedFiles:e.changedFiles}:{}}})},"parseReviewedPrs",0,function(e){return ec(e).filter(e=>e?.id).map(e=>{let t=e.reviews?.nodes?.[0]??{},r=e.commits?.nodes?.[0]?.commit??{},n=r.pushedDate??r.committedDate??"",i=t.submittedAt??"";return{id:e.id,title:e.title,url:e.url,number:e.number,repo:e.repository?.nameWithOwner??"",author:e.author?.login??"unknown",state:eg.has(t.state)?t.state:"COMMENTED",reviewedAt:i,updatedSince:!!n&&!!i&&Date.parse(n)>Date.parse(i),isDraft:e.isDraft??!1}}).filter(e=>""!==e.reviewedAt)},"parseStuckPrs",0,function(e){return ec(e).filter(e=>e?.id).map(e=>{let t=e.commits?.nodes?.[0]?.commit??{},{failing:r,pending:n,failingChecks:i,pendingChecks:s,checkNames:o}=eo(t.statusCheckRollup?.contexts?.nodes??[]),a="BLOCKED"===e.mergeStateStatus||"DIRTY"===e.mergeStateStatus,u=eu(e),l=e.mergeStateStatus??"";return{id:e.id,title:e.title,url:e.url,number:e.number,repo:e.repository?.nameWithOwner??"",failingChecks:i,pendingChecks:s,failing:r,pending:n,checkNames:o,isDraft:e.isDraft??!1,blocked:a,readyViaBlocked:u,reviewDecision:function(e){let t=e.reviewDecision??"";if("CHANGES_REQUESTED"!==t)return t;let r=e.latestReviews?.nodes??[];return 0===r.length||r.some(e=>e?.state==="CHANGES_REQUESTED")?t:"REVIEW_REQUIRED"}(e),mergeState:l,unresolvedThreads:ea(e),stuckSince:t.pushedDate??t.committedDate??""}}).filter(e=>e.failingChecks>0||e.pendingChecks>0||e.blocked||e.isDraft)},"searchQuery",0,function(e,t){let r=t?` ${t}`:"",n=z[e];return`${"closed"===e?"is:closed":"is:open"} is:pr ${n}${r}${"closed"===e||"reviewed"===e?" sort:updated-desc":""}`}],53532)}];

//# sourceMappingURL=_1oq49oq._.js.map