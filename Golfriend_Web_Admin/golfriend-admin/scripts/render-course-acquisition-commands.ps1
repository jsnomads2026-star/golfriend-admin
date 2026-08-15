param(
  [Parameter(Mandatory=$true)][ValidateSet('prepare','deploy','verify','disable','rollback','rotate-key','reduce-quota')][string]$Action,
  [switch]$Template
)
$ErrorActionPreference='Stop'
$arguments=@('scripts/render-course-acquisition-commands.mjs',$Action)
if($Template){$arguments+='--template'}
& node @arguments
if($LASTEXITCODE -ne 0){throw "COMMAND_RENDER_FAILED:$LASTEXITCODE"}
