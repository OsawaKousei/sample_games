# AWSへの公開

`ref/infra`と同じS3＋CloudFrontを使用します。各アプリに専用のS3バケットとCloudFrontディストリビューションを作り、既存Route 53ゾーンにA/AAAAエイリアスを追加します。

| アプリ | 公開URL |
| --- | --- |
| 五目並べ | https://gomoku.dev.kupac.org |
| STARFALL | https://shooter.dev.kupac.org |
| WILDBLOOM | https://survivor.dev.kupac.org |

AWSアカウントは`366950153268`、バケットは東京リージョンです。証明書は指定のus-east-1の`*.dev.kupac.org`用ACM証明書を使用します。S3のパブリックアクセスはブロックし、各ディストリビューションのOACに読み取りだけを許可します。日本を含む`PriceClass_200`を使用します。

Terraform stateは参照元と同じ既存S3バケットの別キー`webpage/signal-arcade/terraform.tfstate`に保存し、S3ロックファイルを使用します。参照元のstateやリソースは変更しません。`.terraform.lock.hcl`はGitで管理し、state・作業ディレクトリ・保存済みplanは除外します。

## デプロイ

Node.js 22.12以上、AWS CLI、Terraform 1.10以上、既存AWSプロファイル`kupac`が必要です。リポジトリのルートで実行します。

```sh
aws sso login --profile kupac
npm ci
npm run deploy
```

デプロイスクリプトは認証・アカウント・証明書を確認後、3作品をビルドし、Terraformの初期化・検証・plan保存・そのplanのapplyを実行します。初回はCloudFrontの作成とDNS反映に数分かかります。DNSレコードが既存の場合は上書きせずエラーにします。公開ゾーンの既定値は`kupac.org`です。`dev.kupac.org`が別ゾーンとして委任されている場合は`TF_VAR_dns_zone_name=dev.kupac.org npm run deploy`で指定してください。

ハッシュ付きアセットを先にアップロードし、最後に`index.html`を更新します。アセットは1年間のimmutableキャッシュ、HTMLは再検証必須です。開いたままの画面が旧アセットを参照できるよう、旧ハッシュのファイルは削除しません。CloudFrontのキャッシュ無効化の完了後に、公開内容を検証します。将来の再デプロイも同じコマンドを使用します。

```sh
# 変更内容だけを確認
terraform -chdir=infra init
terraform -chdir=infra plan

# 公開URL・CloudFront ID・バケット名
terraform -chdir=infra output apps

# 現在のローカルビルドと公開ファイルの一致、HTTPS、キャッシュ、直接アクセスを検証
npm run verify:deployment
```

CloudFront Functionは拡張子のないルートを`/index.html`へ内部書き換えします。STARFALLの`/debug`や各チェックポイントへの直接アクセスも有効です。存在しないJS/CSSにはHTMLを返しません。

既存プロファイルと同じ権限を持つ別名プロファイルを使う場合は`AWS_PROFILE=... npm run deploy`でバックエンドとプロバイダーの両方に指定できます。AWSアカウントIDは固定し、別アカウントへの誤デプロイを防ぎます。
