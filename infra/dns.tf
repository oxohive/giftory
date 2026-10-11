# ─── ACM Certificate (backend API subdomain) ─────────────────────────────────

resource "aws_acm_certificate" "mercato" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# ─── Porkbun DNS ──────────────────────────────────────────────────────────────

# ACM DNS validation record for the API cert
resource "porkbun_dns_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.mercato.domain_validation_options : dvo.domain_name => dvo
  }

  domain  = var.domain_name
  type    = each.value.resource_record_type
  name    = trimsuffix(each.value.resource_record_name, ".${var.domain_name}.")
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = "600"
}

# CAA record allowing Amazon ACM to issue certificates for oxohive.com (root)
resource "porkbun_dns_record" "caa_amazon" {
  domain  = var.domain_name
  type    = "CAA"
  name    = ""
  content = "0 issue \"amazon.com\""
  ttl     = "600"
}

# CNAME: admin.giftory.dev.oxohive.com → ALB
resource "porkbun_dns_record" "api" {
  domain  = var.domain_name
  type    = "CNAME"
  name    = var.api_subdomain
  content = aws_lb.main.dns_name
  ttl     = "600"
}

# ─── ACM Validation wait ──────────────────────────────────────────────────────

resource "aws_acm_certificate_validation" "mercato" {
  certificate_arn         = aws_acm_certificate.mercato.arn
  validation_record_fqdns = [for r in porkbun_dns_record.acm_validation : "${r.name}.${var.domain_name}"]
}
