# ─── ACM Certificate ──────────────────────────────────────────────────────────

resource "aws_acm_certificate" "mercato" {
  domain_name       = "${var.subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# ─── Porkbun DNS ──────────────────────────────────────────────────────────────

# ACM DNS validation record
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

# CNAME pointing giftory.dev.oxohive.com → ALB hostname
resource "porkbun_dns_record" "mercato" {
  domain  = var.domain_name
  type    = "CNAME"
  name    = var.subdomain
  content = aws_lb.main.dns_name
  ttl     = "600"
}

# ─── ACM Validation wait ──────────────────────────────────────────────────────

resource "aws_acm_certificate_validation" "mercato" {
  certificate_arn         = aws_acm_certificate.mercato.arn
  validation_record_fqdns = [for r in porkbun_dns_record.acm_validation : "${r.name}.${var.domain_name}"]
}
