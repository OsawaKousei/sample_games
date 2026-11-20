terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Keep the reference site's state completely separate.
  backend "s3" {
    bucket       = "terraform-state-bucket-366950153268-ap-northeast-1-an"
    key          = "webpage/signal-arcade/terraform.tfstate"
    region       = "ap-northeast-1"
    profile      = "kupac"
    encrypt      = true
    use_lockfile = true
  }
}
