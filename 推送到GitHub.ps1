# ---------------------------------------------------------------
#  HanLin 英语采访 —— 一键推送到你的 GitHub（私有仓库）
#  用法：右键这个文件 →「使用 PowerShell 运行」
# ---------------------------------------------------------------
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw '没有找到 git。请先安装 Git for Windows：https://git-scm.com/download/win'
}
if (-not (Test-Path -LiteralPath '.git')) {
    throw '这个脚本旁边没有 .git 文件夹，请把它放回仓库根目录再运行。'
}

Write-Host ''
Write-Host '=== HanLin 英语采访 · 推送到 GitHub ===' -ForegroundColor Cyan
Write-Host ''

$user = (Read-Host 'GitHub 用户名').Trim()
if (-not $user) { throw '用户名不能为空' }

$repo = (Read-Host '仓库名（直接回车 = hanlin-english-interview）').Trim()
if (-not $repo) { $repo = 'hanlin-english-interview' }

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
Write-Host '正在创建私有仓库…'
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
    Write-Host "  已创建私有仓库 $user/$repo" -ForegroundColor Green
} catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 422) {
        Write-Host '  仓库已存在，直接往里推。' -ForegroundColor Yellow
    } elseif ($code -eq 401) {
        throw 'Token 无效或已过期（401）。请重新生成一个勾了 repo 的 classic token。'
    } else {
        throw "创建仓库失败：$($_.Exception.Message)"
    }
}

# 让这次提交的作者就是你自己
git -c user.name="$user" -c user.email="$user@users.noreply.github.com" `
    commit --amend --reset-author --no-edit | Out-Null

git remote remove origin 2>$null
git remote add origin "https://github.com/$user/$repo.git"

Write-Host '正在推送（单文件版约 65 MB，第一次会慢一点，请别关窗口）…'
$authUrl = "https://$user`:$tok@github.com/$user/$repo.git"
git push $authUrl HEAD:main
if ($LASTEXITCODE -ne 0) { throw '推送失败，请看上面的报错。' }

# 不把 token 留在 .git/config 里
git remote set-url origin "https://github.com/$user/$repo.git"
git config branch.main.remote origin
git config branch.main.merge refs/heads/main

Write-Host ''
Write-Host "完成：https://github.com/$user/$repo" -ForegroundColor Green
Write-Host ''
Read-Host '按回车关闭'
