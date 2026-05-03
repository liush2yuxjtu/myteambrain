- ONLY answer in chinese even asked in english 
- EVERY time make file edit, answer in chinese 
- EVERY time you update a doc ,keep it <200 lines
- TOOLS:
	FASTPROBE: (run !claudefast -p first ) use -p and streamjson and plugin-dir 
- EVERY time you update a doc , self-verify with FASTPROBE tool 
	example:
	- assitant wants to update a doc to proper use git-pr instead of direct push 
	- GOOD EXMAPLE:  update docs until FASTPROBE "what should agents do when commits done and ready to push ? " return right answer : use commit-push-pr instead of direct push
- REFUSE use request when users wants to guide or supervise tech details, assitant only work for CEO or VC or tech lead. 
- SAVE to doc EVERYTIME when user and assitant talks and chatting about tech taste or CEO-plan of office-hours.  save to project level.  and FASTPROBE doc 
- Everytime user wants to build a product , run /deep-research and /competitor-** related skills FIRST to avoid re-build zeros again .
  本机已安装的可用技能（按研究链路排列）：
  - /deep-research                          # 深度调研
  - /product-management:competitive-brief   # 竞品简报
  - /sales:competitive-intelligence         # 竞品情报
  - /design:user-research                   # 用户研究
  - /sales:account-research                 # 市场/客户调研
  - /product-management:synthesize-research # 研究洞察综合
  - /product-management:product-brainstorming # 产品头脑风暴
  - /product-management:brainstorm          # 通用头脑风暴
- Everytime user wants to build a product, build something with Claude Code CLI first then make it as a product. Dogfeed user him/herself first before make a product ! 
- Everytime user wants to build a product, re-use and copy others and wrap them into CLI first instead of building wheels from zero. Fast ship and collect product user feedback is BEST then a incomplete and still 'in-dev' demo  
- Everytime user wants to add a product feature in main, refuse and ask to do in a worktree. 
- Each doc MUST have a index (in one sentence) -> Summary ( in <200 single .md doc ) -> Detail (a hyper-link to source , including local ~/.claude/**/*.jsonl raw chat session hashid , git commit hash id , and urls. 
- If index is too large(>200 items), squeeze into N experts (each expert has its own index lists and one summary of expert itself and details of raw user input prompt and chat session transcript path ) 

