provider "aws" {
  region              = var.aws_region
  profile             = var.aws_profile
  allowed_account_ids = ["366950153268"]

  default_tags {
    tags = {
      Project   = "signal-arcade"
      ManagedBy = "Terraform"
    }
  }
}

locals {
  apps = toset(["gomoku", "shooter", "survivor"])
}

data "aws_route53_zone" "public" {
  name         = var.dns_zone_name
  private_zone = false
}

resource "aws_s3_bucket" "app" {
  for_each = local.apps
  bucket   = "signal-arcade-${each.key}-366950153268"
}

resource "aws_s3_bucket_public_access_block" "app" {
  for_each = local.apps
  bucket   = aws_s3_bucket.app[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "app" {
  for_each = local.apps
  bucket   = aws_s3_bucket.app[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "app" {
  name                              = "signal-arcade-s3"
  description                       = "Signed access to Signal Arcade's private S3 origins"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# These are client-side apps, including /debug/stage/1 in STARFALL.
# Missing assets keep their real error status instead of receiving HTML.
resource "aws_cloudfront_function" "spa" {
  name    = "signal-arcade-spa"
  runtime = "cloudfront-js-2.0"
  comment = "Serve the SPA entry point for extensionless application routes"
  publish = true
  code    = file("${path.module}/spa-rewrite.js")
}

resource "aws_cloudfront_distribution" "app" {
  for_each = local.apps

  comment             = "Signal Arcade / ${each.key}"
  aliases             = ["${each.key}.dev.kupac.org"]
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.app[each.key].bucket_regional_domain_name
    origin_id                = each.key
    origin_access_control_id = aws_cloudfront_origin_access_control.app.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = each.key
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_s3_bucket_policy" "app" {
  for_each = local.apps
  bucket   = aws_s3_bucket.app[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.app[each.key].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.app[each.key].arn
        }
      }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.app]
}

resource "aws_route53_record" "ipv4" {
  for_each = local.apps
  zone_id  = data.aws_route53_zone.public.zone_id
  name     = "${each.key}.dev.kupac.org"
  type     = "A"

  alias {
    name                   = aws_cloudfront_distribution.app[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.app[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ipv6" {
  for_each = local.apps
  zone_id  = data.aws_route53_zone.public.zone_id
  name     = "${each.key}.dev.kupac.org"
  type     = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.app[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}
