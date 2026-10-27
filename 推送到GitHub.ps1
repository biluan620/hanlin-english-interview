# ---------------------------------------------------------------
#  HanLin 英语采访 —— 一键推送到 GitHub
#  用法：右键这个文件 →「使用 PowerShell 运行」
# ---------------------------------------------------------------
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$DefaultUrl = 'https://github.com/biluan620/gym-log.git'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw '没有找到 git。请先安装 Git for Windows：https://git-scm.com/download/win'
}
if (-not (Test-Path -LiteralPath '.git')) {
    throw '这个脚本旁边没有 .git 文件夹，请把它放回仓库根目录再运行。'
}

Write-Host ''
Write-Host '=== HanLin 英语采访 · 推送到 GitHub ===' -ForegroundColor Cyan
Write-Host ''

$url = (Read-Host "仓库地址（直接回车 = $DefaultUrl）").Trim()
if (-not $url) { $url = $DefaultUrl }
$url = $url.TrimEnd('/')
if ($url -notmatch '^https?://') {
    throw '仓库地址要以 https:// 开头，例如 https://github.com/biluan620/gym-log'
}
if ($url -notmatch '\.git$') { $url = $url + '.git' }
if ($url -notmatch '^https?://github\.com/(?<u>[^/]+)/(?<r>[^/]+?)\.git$') {
    throw '这个地址看不懂，格式应该是 https://github.com/用户名/仓库名'
}
$user = $Matches['u']
$repo = $Matches['r']
Write-Host "  目标仓库：$user/$repo"

Write-Host ''
Write-Host '需要一个 Personal Access Token（classic，勾上 repo 权限）：' -ForegroundColor Yellow
Write-Host '  打开这个网址直接生成：https://github.com/settings/tokens/new?scopes=repo&description=HanLin'
Write-Host '  Token 只用于这一次推送，不会写进任何文件。'
$sec = Read-Host '粘贴 Token（输入时不显示）' -AsSecureString
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $tok) { throw 'Token 不能为空' }

$headers = @{
    Authorization = "Bearer $tok"
    Accept        = 'application/vnd.github+json'
    'User-Agent'  = 'HanLin-Push'
}

Write-Host ''
Write-Host '正在确认仓库…'
$body = @{
    name        = $repo
    private     = $true
    description = 'HanLin 英语采访机器人（初二英语课堂）'
    has_issues  = $false
    has_wiki    = $false
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post `
        -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
    Write-Host "  仓库原来不存在，已新建私有仓库 $user/$repo" -ForegroundColor Green
} catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 422) {
        Write-Host '  仓库已存在，直接往里推。' -ForegroundColor Yellow
    } elseif ($code -eq 401) {
        throw 'Token 无效或已过期（401）。请重新生成一个勾了 repo 的 classic token。'
    } else {
        Write-Host "  没能确认仓库（$($_.Exception.Message)），先继续尝试直接推送。" -ForegroundColor Yellow
    }
}

# 让这次提交的作者就是你自己
git -c user.name="$user" -c user.email="$user@users.noreply.github.com" `
    commit --amend --reset-author --no-edit | Out-Null

git remote remove origin 2>$null
git remote add origin $url

Write-Host '正在推送（单文件版约 65 MB，第一次会慢一点，请别关窗口）…'
$authUrl = "https://$user`:$tok@github.com/$user/$repo.git"
git push $authUrl HEAD:main
if ($LASTEXITCODE -ne 0) {
    throw '推送失败。如果提示 non-fast-forward / rejected，说明这个仓库里已经有别的文件，不能直接覆盖——换一个新仓库名再试。'
}

# 不把 token 留在 .git/config 里
git remote set-url origin $url
git config branch.main.remote origin
git config branch.main.merge refs/heads/main

Write-Host ''
Write-Host "完成：https://github.com/$user/$repo" -ForegroundColor Green
Write-Host ''
Read-Host '按回车关闭'
