output "apps" {
  description = "Deployment destinations for each independent game"
  value = {
    for app in local.apps : app => {
      url             = "https://${app}.dev.kupac.org"
      bucket          = aws_s3_bucket.app[app].id
      distribution_id = aws_cloudfront_distribution.app[app].id
      cloudfront_host = aws_cloudfront_distribution.app[app].domain_name
    }
  }
}
