package com.voicemap.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.servlet.MultipartConfigFactory;

import jakarta.servlet.MultipartConfigElement;

@Configuration
public class MultipartConfig {

    @Bean
    public MultipartConfigElement multipartConfigElement() {
        MultipartConfigFactory factory = new MultipartConfigFactory();
        // The methods setMaxFileSize and setMaxRequestSize require a DataSize object, not a String.
        // Use DataSize.ofMegabytes(100) instead of "100MB" to avoid incompatible types.
        factory.setMaxFileSize(org.springframework.util.unit.DataSize.ofMegabytes(100));
        factory.setMaxRequestSize(org.springframework.util.unit.DataSize.ofMegabytes(100));
        return factory.createMultipartConfig();
    }
}

