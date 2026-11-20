variable "aws_profile" {
  description = "AWS shared configuration profile"
  type        = string
  default     = "kupac"
}

variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "dns_zone_name" {
  description = "Existing public Route 53 hosted zone containing dev.kupac.org"
  type        = string
  default     = "kupac.org"
}

variable "acm_certificate_arn" {
  description = "Issued us-east-1 ACM certificate covering *.dev.kupac.org"
  type        = string
  default     = "arn:aws:acm:us-east-1:366950153268:certificate/eae9b4d5-8346-4a57-8901-1b2d6d534c78"
}
