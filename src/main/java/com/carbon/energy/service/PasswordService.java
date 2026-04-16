package com.carbon.energy.service;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * 密码哈希工具。
 *
 * <p>为了避免在数据库里保存明文密码，这里使用 JDK 自带的 PBKDF2 做单向哈希。
 * 数据库存储格式为：pbkdf2$迭代次数$盐值Base64$哈希Base64。</p>
 */
@Service
public class PasswordService {

  private static final String HASH_PREFIX = "pbkdf2";
  private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
  private static final int DEFAULT_ITERATIONS = 310_000;
  private static final int SALT_BYTES = 16;
  private static final int HASH_BITS = 256;

  private final SecureRandom secureRandom = new SecureRandom();

  public String hash(String password) {
    byte[] salt = new byte[SALT_BYTES];
    secureRandom.nextBytes(salt);
    byte[] hash = pbkdf2(password, salt, DEFAULT_ITERATIONS);
    return HASH_PREFIX
        + "$" + DEFAULT_ITERATIONS
        + "$" + Base64.getEncoder().encodeToString(salt)
        + "$" + Base64.getEncoder().encodeToString(hash);
  }

  public boolean verify(String password, String storedHash) {
    if (password == null || storedHash == null || storedHash.isBlank()) {
      return false;
    }

    String[] parts = storedHash.split("\\$");
    if (parts.length != 4 || !HASH_PREFIX.equals(parts[0])) {
      return false;
    }

    try {
      int iterations = Integer.parseInt(parts[1]);
      byte[] salt = Base64.getDecoder().decode(parts[2]);
      byte[] expected = Base64.getDecoder().decode(parts[3]);
      byte[] actual = pbkdf2(password, salt, iterations);
      return MessageDigest.isEqual(expected, actual);
    } catch (IllegalArgumentException error) {
      return false;
    }
  }

  private byte[] pbkdf2(String password, byte[] salt, int iterations) {
    try {
      PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, HASH_BITS);
      return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
    } catch (Exception error) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "密码处理失败");
    }
  }
}
