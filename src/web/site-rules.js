(() => {
  // Independent schema v1. Vendor configuration is evidence only, never executable input.
  const rules = [
  {
    id:'google',name:'Google',
    match:{domains:['google.com','google.com.hk','google.com.tw','google.co.jp','google.co.uk','google.ca','google.com.au','google.de','google.fr','google.co.in','google.com.sg'],subdomains:true,skipPaths:[]}
  },
  {
    id:'huggingface',name:'Hugging Face',
    match:{domains:['huggingface.co'],subdomains:false,skipPaths:[]}
  },
  {
    "id": "reddit",
    "name": "Reddit",
    "match": {
      "domains": [
        "reddit.com"
      ],
      "subdomains": true,
      "skipPaths": [
        "/settings",
        "/message"
      ]
    },
    "content": {
      "roots": "[slot=title],[slot=text-body],[slot=comment],shreddit-post-text-body,[data-post-click-location=text-body],.pt-md,[data-testid=post-title-text],[data-testid=comment],.RichTextJSON-root,.PostContent,.post-content,.Comment__body,.usertext-body,.md-container,.rendererd-rtjson",
      "standalone": "h1,h2,h3,p.title > a",
      "exclude": "aside,[role=complementary],shreddit-comment-action-row,shreddit-post-overflow-menu,faceplate-hovercard,time,[slot=credit-bar],[slot=post-meta]",
      "scope": "strict"
    },
    "paragraph": {
      "block": "[slot=text-body] p,[slot=comment] p,.md p,.md li,.md blockquote,.RichTextJSON-root p,.RichTextJSON-root li",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": true,
      "boundary": "shreddit-post,shreddit-comment,article,main,body"
    },
    "verification": "待页面验证"
  },
  {
    "id": "hacker-news",
    "name": "Hacker News",
    "match": {
      "domains": [
        "news.ycombinator.com"
      ],
      "subdomains": false,
      "skipPaths": []
    },
    "content": {
      "roots": ".titleline,.commtext,.toptext",
      "standalone": ".title > a",
      "exclude": ".pagetop,.subtext,.rank,.votelinks,.yclinks,.sitestr,.comhead,.reply",
      "scope": "fallback"
    },
    "paragraph": {
      "block": ".commtext p,.commtext li,.commtext blockquote,.toptext p",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": false,
      "boundary": "article,main,body"
    },
    "verification": "待页面验证"
  },
  {
    "id": "github",
    "name": "GitHub",
    "match": {
      "domains": [
        "github.com"
      ],
      "subdomains": false,
      "skipPaths": [
        "/settings",
        "/login",
        "/sessions"
      ]
    },
    "content": {
      "roots": ".markdown-body,.comment-body,.js-comment-body,.js-issue-title,[data-testid=issue-title],article",
      "standalone": "main h1,main h2",
      "exclude": ".blob-code,.blob-num,.react-code-text,.react-line-number,.file-navigation,.Header,header[role=banner],.AppHeader,[role=toolbar],.diff-table,.js-diff-progressive-container",
      "scope": "fallback"
    },
    "paragraph": {
      "block": ".markdown-body p,.markdown-body li,.markdown-body blockquote,.comment-body p",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": false,
      "boundary": "article,main,body"
    },
    "verification": "待页面验证"
  },
  {
    "id": "wikipedia",
    "name": "Wikipedia",
    "match": {
      "domains": [
        "wikipedia.org"
      ],
      "subdomains": true,
      "skipPaths": []
    },
    "content": {
      "roots": "#mw-content-text .mw-parser-output",
      "standalone": "#firstHeading",
      "exclude": ".mw-editsection,.reference,.references,.reflist,.navbox,.vertical-navbox,.mw-jump-link,.vector-header,.vector-page-toolbar,.vector-toc,.metadata",
      "scope": "fallback"
    },
    "paragraph": {
      "block": ".mw-parser-output p,.mw-parser-output li,.mw-parser-output blockquote",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": false,
      "boundary": "article,main,body"
    },
    "verification": "待页面验证"
  },
  {
    "id": "medium",
    "name": "Medium",
    "match": {
      "domains": [
        "medium.com"
      ],
      "subdomains": true,
      "skipPaths": []
    },
    "content": {
      "roots": "article",
      "standalone": "",
      "exclude": "header,footer,aside,[role=toolbar],time",
      "scope": "fallback"
    },
    "paragraph": {
      "block": "article p,article li,article blockquote",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": false,
      "boundary": "article,main,body"
    },
    "verification": "待页面验证"
  },
  {
    "id": "substack",
    "name": "Substack",
    "match": {
      "domains": [
        "substack.com"
      ],
      "subdomains": true,
      "skipPaths": []
    },
    "content": {
      "roots": ".available-content,.body.markup,.post-content,.post-title,.subtitle,.comment-body",
      "standalone": "article h1",
      "exclude": "header,footer,aside,.post-ufi,.subscribe-widget,.subscription-widget,.post-header .meta,time",
      "scope": "fallback"
    },
    "paragraph": {
      "block": ".body.markup p,.body.markup li,.body.markup blockquote,.comment-body p",
      "inline": "a,strong,em,b,i,small,sup,sub",
      "splitLooseText": true
    },
    "layout": {
      "unclamp": false,
      "boundary": "article,main,body"
    },
    "verification": "待页面验证"
  }
];
  rules.push(...[
  {
    "id": "stack-exchange",
    "name": "Stack Exchange",
    "match": {
      "domains": [
        "stackoverflow.com",
        "stackexchange.com",
        "superuser.com",
        "serverfault.com",
        "askubuntu.com"
      ],
      "subdomains": true,
      "skipPaths": [
        "/users",
        "/account"
      ]
    },
    "category": "community",
    "content": {
      "roots": ".s-prose,.js-post-body,#question-header h1",
      "exclude": ".post-menu,.js-voting-container,.user-info,nav,aside",
      "scope": "fallback"
    }
  },
  {
    "id": "discourse",
    "name": "Discourse 社区",
    "match": {
      "domains": [
        "meta.discourse.org",
        "discuss.huggingface.co",
        "discuss.python.org"
      ],
      "subdomains": false,
      "skipPaths": [
        "/admin",
        "/preferences"
      ]
    },
    "category": "community",
    "content": {
      "roots": ".cooked,.fancy-title",
      "exclude": ".topic-meta-data,.post-menu-area,nav,aside",
      "scope": "fallback"
    }
  },
  {
    "id": "mdn",
    "name": "MDN 文档",
    "match": {
      "domains": [
        "developer.mozilla.org"
      ],
      "subdomains": false,
      "skipPaths": []
    },
    "category": "docs",
    "content": {
      "roots": "main article,.main-page-content",
      "exclude": ".code-example,nav,aside,.prev-next",
      "scope": "fallback"
    }
  },
  {
    "id": "readthedocs",
    "name": "Read the Docs",
    "match": {
      "domains": [
        "readthedocs.io"
      ],
      "subdomains": true,
      "skipPaths": []
    },
    "category": "docs",
    "content": {
      "roots": "[role=main],article",
      "exclude": ".headerlink,.wy-nav-side,.sphinxsidebar,nav,aside",
      "scope": "fallback"
    }
  },
  {
    "id": "guardian",
    "name": "The Guardian",
    "match": {
      "domains": [
        "theguardian.com"
      ],
      "subdomains": true,
      "skipPaths": []
    },
    "category": "news",
    "content": {
      "roots": "article h1,article h2,[data-gu-name=body],.article-body-commercial-selector",
      "exclude": "aside,nav,figcaption time,[data-component=share]",
      "scope": "fallback"
    }
  }
]);
  const generic = {
    id:'generic', name:'通用网页',
    content:{roots:'',standalone:'',exclude:'',scope:'fallback'},
    paragraph:{block:'',inline:'',splitLooseText:true},
    layout:{unclamp:false,boundary:'article,main,body'},
    verification:'待页面验证'
  };
  // Ordered, first matching page profile; merges explicitly with the site's base.
  const pages={
    google:[
      {id:'search',name:'搜索结果',path:'^/search/?$',
        content:{roots:'#search h3,#rso h3,#search .VwiC3b,#rso .VwiC3b,#search [data-sncf],#rso [data-sncf],#search .IsZvec,#rso .IsZvec',
          exclude:'cite,.VuuXrf,.TbwUpd,.qLRx3b,[role=toolbar],[role=tablist],#searchform,#top_nav,#botstuff',scope:'strict'},
        paragraph:{block:'.VwiC3b,[data-sncf],.IsZvec',splitLooseText:false},layout:{unclamp:true,boundary:'.MjjYud,.g,#rso,#search,body',searchResults:true}}
    ],
    huggingface:[
      {id:'discussions',name:'社区讨论列表',path:'^/(?:datasets/|spaces/)?[^/]+/[^/]+/discussions/?$',
        content:{roots:'a[href*="/discussions/"] h4',standalone:'main h1',scope:'strict'},
        paragraph:{splitLooseText:false},layout:{discussionRows:true}}
    ],
    reddit:[
      {id:'comment',name:'评论定位',path:'^/(?:r/[^/]+/)?comments/[^/]+/[^/]+/[^/]+/?$'},
      {id:'post',name:'帖子详情',path:'^/(?:r/[^/]+/)?comments/[^/]+'},
      {id:'listing',name:'帖子列表',path:'.*',content:{standalone:'h1,h2,h3,p.title > a',exclude:'aside,[role=complementary],shreddit-comment-action-row,shreddit-post-overflow-menu,faceplate-hovercard,time,[slot=credit-bar],[slot=post-meta],shreddit-comment'}}
    ],
    github:[
      {id:'issue-list',name:'Issue / PR 列表',path:'^/[^/]+/[^/]+/(?:issues|pulls)/?$',
       content:{roots:'a[data-testid="issue-listitem-title-link"],a[data-testid="listitem-title-link"],a[data-testid="issue-pr-title-link"],a[data-testid="issue-title-link"],a.Link--primary[href*="/issues/"],a.Link--primary[href*="/pull/"],.js-issue-row a.markdown-title',standalone:'main h1',scope:'strict'},
       paragraph:{splitLooseText:false},layout:{unclamp:true,boundary:'.js-issue-row,[data-testid="list-row"],main,body'}},
      {id:'diff',name:'PR 代码差异',path:'^/[^/]+/[^/]+/pull/[0-9]+/(?:files|commits)(?:/|$)',blocked:true},
      {id:'issue',name:'Issue / PR 讨论',path:'^/[^/]+/[^/]+/(?:issues|pull)/[0-9]+(?:/|$)',content:{roots:'.markdown-body,.comment-body,.js-comment-body,.js-issue-title,[data-testid=issue-title]',scope:'strict'}},
      {id:'readme',name:'README / 文档',path:'^/[^/]+/[^/]+/blob/.*\\.(?:md|mdx|rst|txt)$',content:{roots:'.markdown-body,article',scope:'strict'}},
      {id:'code',name:'代码文件',path:'^/[^/]+/[^/]+/(?:blob|blame|commit|compare)(?:/|$)',blocked:true},
      {id:'repository',name:'仓库文档与介绍',path:'^/[^/]+/[^/]+(?:/tree/.*)?/?$',content:{roots:'.markdown-body,article,.Layout-sidebar .BorderGrid-cell p,.Layout-sidebar [itemprop=description],[data-component="SplitPageLayout.Pane"] [itemprop=description],.Layout-sidebar .BorderGrid-cell > .text-small,[class*="sidebarSection"] p[data-component="Text"],[class*="sidebarSection"] h2[data-component="Heading"]',standalone:'.Layout-sidebar .BorderGrid-cell h2,.Layout-sidebar .BorderGrid-cell h3',scope:'strict'}}
    ]
  };
  function resolve(url,{disabledIds=[]}={}){
    const host=url.hostname.toLowerCase();
    const rule=rules.find(r=>!disabledIds.includes(r.id)&&r.match.domains.some(domain=>host===domain||(r.match.subdomains&&host.endsWith('.'+domain))));
    const page=(pages[rule?.id]||[]).find(p=>!disabledIds.includes(rule.id+':'+p.id)&&new RegExp(p.path,'i').test(url.pathname));
    return {
      ...generic,...rule,
      schemaVersion:2,pageId:page?.id||'default',
      name:(rule?.name||generic.name)+(page?' · '+page.name:''),
      content:{...generic.content,...rule?.content,...page?.content},
      paragraph:{...generic.paragraph,...rule?.paragraph,...page?.paragraph},
      layout:{...generic.layout,...rule?.layout,...page?.layout},
      blocked:!!page?.blocked||(rule?.match.skipPaths||[]).some(path=>url.pathname===path||url.pathname.startsWith(path+'/'))
    };
  }
  globalThis.ReaderSiteRules=Object.freeze({schemaVersion:2,resolve,ids:Object.freeze(rules.map(r=>r.id))});
})();
